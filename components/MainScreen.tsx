
import React, { useState, useEffect } from 'react';
import { User } from '@firebase/auth';
import { ref, onValue, set, push, remove, serverTimestamp, get, query, orderByChild, limitToLast, update } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../services/firebase';
import type { UserProfile, Contact, FriendRequest, Call, EnrichedContact, Message, CallRecord } from '../types';
import { MenuIcon, ChatIcon, CogIcon, ArrowUpRightIcon, ArrowDownLeftIcon, VideoIcon, PhoneIcon, ShieldCheckIcon } from './Icons';
import { formatPresenceTimestamp, formatTimestamp } from '../utils/format';
import Avatar from './Avatar';
import { useTheme } from '../contexts/ThemeContext';

interface MainScreenProps {
  user: User;
  profile: UserProfile;
  onSelectChat: (partner: Contact) => void;
  onStartCall: (partner: Contact, type: 'video' | 'voice') => void;
  onNavigateToSettings: () => void;
  onNavigateToAdmin: () => void;
  incomingCall: Call | null;
  onAcceptCall: () => void;
  onRejectCall: () => void;
}

type Tab = 'chats' | 'requests' | 'calls';

const MainScreen: React.FC<MainScreenProps> = ({ user, profile, onSelectChat, onStartCall, onNavigateToSettings, onNavigateToAdmin, incomingCall, onAcceptCall, onRejectCall }) => {
  const [activeTab, setActiveTab] = useState<Tab>('chats');
  const [contacts, setContacts] = useState<EnrichedContact[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [callLogs, setCallLogs] = useState<CallRecord[]>([]);
  
  const [isAddFriendModalOpen, setAddFriendModalOpen] = useState(false);
  const [isProfileModalOpen, setProfileModalOpen] = useState(false);

  useEffect(() => {
    // --- Existing listeners for contacts and requests ---
    const contactsRef = ref(db, `contacts/${user.uid}`);
    const listeners: (() => void)[] = [];

    const unsubscribeContacts = onValue(contactsRef, (snapshot) => {
      listeners.forEach(l => l());
      listeners.length = 0;

      const contactsData = snapshot.val() || {};
      const contactList = Object.values(contactsData) as Contact[];

      const enrichedContactList: EnrichedContact[] = contactList.map(c => ({...c}));
      setContacts(enrichedContactList);

      enrichedContactList.forEach((contact) => {
        const chatId = [user.uid, contact.uid].sort().join('_');
        
        const lastMessageQuery = query(ref(db, `messages/${chatId}`), orderByChild('ts'), limitToLast(1));
        const unsubMessage = onValue(lastMessageQuery, (msgSnap) => {
          if (msgSnap.exists()) {
            const lastMessage = Object.values(msgSnap.val())[0] as Message;
            setContacts(prev => {
              const newContacts = prev.map(c => 
                c.uid === contact.uid 
                  ? { ...c, lastMessage: { text: lastMessage.text, ts: lastMessage.ts } } 
                  : c
              );
              newContacts.sort((a, b) => (b.lastMessage?.ts || 0) - (a.lastMessage?.ts || 0));
              return newContacts;
            });
          }
        });
        listeners.push(unsubMessage);
        
        const unreadCountRef = ref(db, `unreadCounts/${user.uid}/${chatId}`);
        const unsubUnread = onValue(unreadCountRef, (unreadSnap) => {
          const unreadCount = unreadSnap.val() || 0;
          setContacts(prev => prev.map(c => c.uid === contact.uid ? { ...c, unreadCount } : c));
        });
        listeners.push(unsubUnread);

        const presenceRef = ref(db, `presence/${contact.uid}`);
        const unsubPresence = onValue(presenceRef, (presenceSnap) => {
          const presence = presenceSnap.val();
          setContacts(prev => prev.map(c => c.uid === contact.uid ? { ...c, presence } : c));
        });
        listeners.push(unsubPresence);
      });
    });

    const requestsRef = ref(db, `requests/${user.uid}`);
    const unsubscribeRequests = onValue(requestsRef, (snapshot) => {
      const data = snapshot.val() || {};
      const requestList = Object.keys(data).map(key => ({ ...data[key], id: key })) as FriendRequest[];
      setRequests(requestList.sort((a,b) => (b.ts || 0) - (a.ts || 0)));
    });

    // --- New listener for call logs ---
    const callLogsRef = query(ref(db, `callLogs/${user.uid}`), orderByChild('ts'));
    const unsubscribeCallLogs = onValue(callLogsRef, (snapshot) => {
        const data = snapshot.val() || {};
        const logList: CallRecord[] = Object.keys(data)
            .map(key => ({ ...data[key], id: key }))
            .sort((a, b) => b.ts - a.ts); // sort descending
        setCallLogs(logList);
    });

    return () => {
      unsubscribeContacts();
      unsubscribeRequests();
      unsubscribeCallLogs();
      listeners.forEach(l => l());
    };
  }, [user.uid]);
  
  const renderTabContent = () => {
    switch (activeTab) {
      case 'chats':
        return <ChatList contacts={contacts} onSelectChat={onSelectChat} />;
      case 'requests':
        return <RequestList requests={requests} user={user} profile={profile} />;
      case 'calls':
        return <CallHistory logs={callLogs} />;
      default:
        return null;
    }
  };
  
  const tabs: Tab[] = ['chats', 'requests', 'calls'];
  const activeTabIndex = tabs.indexOf(activeTab);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 relative">
      <header className="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-4 flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-bold text-green-600 dark:text-green-400">Sameem Chat</h1>
        <div>
          <button onClick={() => setProfileModalOpen(true)} className="p-2 text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 rounded-full"><MenuIcon className="w-6 h-6" /></button>
        </div>
      </header>
      <nav className="relative flex bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 shadow-sm">
        <TabButton title="CHATS" isActive={activeTab === 'chats'} onClick={() => setActiveTab('chats')} badgeCount={0} />
        <TabButton title="REQUESTS" isActive={activeTab === 'requests'} onClick={() => setActiveTab('requests')} badgeCount={requests.length} />
        <TabButton title="CALLS" isActive={activeTab === 'calls'} onClick={() => setActiveTab('calls')} badgeCount={0} />
        <div 
            className="absolute bottom-0 h-1 bg-green-500 dark:bg-green-400 transition-transform duration-300 ease-in-out"
            style={{ width: '33.333%', transform: `translateX(${activeTabIndex * 100}%)` }}
        ></div>
      </nav>
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-800">
        {renderTabContent()}
      </main>
      
      <button 
        onClick={() => setAddFriendModalOpen(true)}
        className="absolute bottom-6 right-6 bg-green-500 text-white rounded-full p-4 shadow-lg hover:bg-green-600 transition-transform hover:scale-110"
        aria-label="Add Friend"
      >
        <ChatIcon className="w-6 h-6" />
      </button>

      {isAddFriendModalOpen && <AddFriendModal profile={profile} onClose={() => setAddFriendModalOpen(false)} />}
      {isProfileModalOpen && <ProfileModal user={user} profile={profile} onClose={() => setProfileModalOpen(false)} onNavigateToSettings={onNavigateToSettings} onNavigateToAdmin={onNavigateToAdmin} />}
      {incomingCall && <IncomingCallModal call={incomingCall} onAccept={onAcceptCall} onReject={onRejectCall} />}
    </div>
  );
};

const TabButton: React.FC<{title: string, isActive: boolean, onClick: ()=>void, badgeCount: number}> = ({title, isActive, onClick, badgeCount}) => (
    <button onClick={onClick} className={`flex-1 py-3 text-sm font-bold relative transition-colors z-10 ${isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
        <div className="flex justify-center items-center">
          {title}
          {badgeCount > 0 && <span className="ml-2 bg-green-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">{badgeCount}</span>}
        </div>
    </button>
);

const ChatList: React.FC<{contacts: EnrichedContact[], onSelectChat: (p:Contact)=>void}> = ({ contacts, onSelectChat }) => {
  if (contacts.length === 0) {
    return <div className="text-center text-gray-500 dark:text-gray-400 mt-10 p-4">No chats yet. Tap the chat icon to add a friend!</div>;
  }
  
  const renderPresence = (presence?: 'online' | number) => {
    if (presence === 'online') {
      return (
        <div className="flex items-center">
          <p className="text-sm text-green-600 dark:text-green-400">Online</p>
        </div>
      );
    }
    if (typeof presence === 'number' && presence > 0) {
        return (
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {formatPresenceTimestamp(presence)}
            </p>
        );
    }
    return null;
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700">
      {contacts.map((contact) => (
        <div key={contact.uid} className="flex items-center p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" onClick={() => onSelectChat(contact)}>
          <Avatar photoURL={contact.photoURL} username={contact.username} />
          <div className="flex-1 ml-4 overflow-hidden">
            <div className="flex justify-between items-center">
                <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{contact.username}</p>
                {contact.lastMessage?.ts && <p className={`text-xs ${contact.unreadCount ? 'text-green-500 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'} shrink-0 ml-2`}>{formatTimestamp(contact.lastMessage.ts)}</p>}
            </div>
            <div className="flex justify-between items-center mt-1">
               {renderPresence(contact.presence) || <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{contact.lastMessage?.text || 'No messages yet'}</p>}
                {contact.unreadCount && contact.unreadCount > 0 ? (
                    <span className="bg-green-500 text-white text-xs rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center font-bold">
                        {contact.unreadCount}
                    </span>
                ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const RequestList: React.FC<{requests: FriendRequest[], user: User, profile: UserProfile}> = ({ requests, user, profile }) => {
    const handleAccept = async (req: FriendRequest) => {
        const updates: {[key: string]: any} = {};
        const contactProfileSnap = await get(ref(db, `users/${req.from}`));
        const contactProfile = contactProfileSnap.val();

        if (contactProfile) {
          updates[`contacts/${user.uid}/${req.from}`] = { uid: req.from, username: contactProfile.username, photoURL: contactProfile.photoURL };
          updates[`contacts/${req.from}/${user.uid}`] = { uid: user.uid, username: profile.username, photoURL: profile.photoURL };
        }
        updates[`requests/${user.uid}/${req.id}`] = null;
        
        update(ref(db), updates);
    };
    
    const handleReject = (reqId: string) => {
        remove(ref(db, `requests/${user.uid}/${reqId}`));
    };
    
    if (requests.length === 0) {
        return <div className="text-center text-gray-500 dark:text-gray-400 mt-10">No new friend requests.</div>;
    }

    return (
        <div className="space-y-2 p-2">
            {requests.map(req => (
                <div key={req.id} className="flex items-center p-3 bg-white dark:bg-gray-700 rounded-lg shadow-sm">
                     <Avatar photoURL={req.fromPhotoURL} username={req.fromUsername} />
                     <div className="flex-1 ml-4">
                        <p className="font-semibold text-gray-800 dark:text-gray-100">{req.fromUsername}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Sent you a friend request</p>
                     </div>
                     <button onClick={() => handleAccept(req)} className="bg-green-500 text-white px-3 py-1 rounded-md text-sm font-semibold hover:bg-green-600">Accept</button>
                     <button onClick={() => handleReject(req.id)} className="bg-red-500 text-white px-3 py-1 rounded-md text-sm font-semibold ml-2 hover:bg-red-600">Reject</button>
                </div>
            ))}
        </div>
    );
};

const CallHistory: React.FC<{ logs: CallRecord[] }> = ({ logs }) => {
    if (logs.length === 0) {
        return <div className="text-center text-gray-500 dark:text-gray-400 mt-10 p-4">No recent calls.</div>;
    }

    return (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {logs.map(log => (
                <div key={log.id} className="flex items-center p-3">
                    <Avatar photoURL={log.partner.photoURL} username={log.partner.username} />
                    <div className="flex-1 ml-4 overflow-hidden">
                        <div className="flex justify-between items-center">
                            <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{log.partner.username}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 shrink-0 ml-2">{formatTimestamp(log.ts)}</p>
                        </div>
                        <div className="flex items-center mt-1">
                            {log.direction === 'outgoing' ? 
                                <ArrowUpRightIcon className="w-4 h-4 text-green-500" /> : 
                                <ArrowDownLeftIcon className="w-4 h-4 text-blue-500" />
                            }
                            {log.type === 'video' ?
                                <VideoIcon className="w-4 h-4 text-gray-500 dark:text-gray-400 ml-2" /> :
                                <PhoneIcon className="w-4 h-4 text-gray-500 dark:text-gray-400 ml-2" />
                            }
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const AddFriendModal: React.FC<{profile: UserProfile, onClose: () => void}> = ({ profile, onClose }) => {
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSendRequest = async () => {
        setError('');
        setSuccess('');
        if (!username) {
            setError('Please enter a username.');
            return;
        }

        const usernameRef = ref(db, `usernames/${username.toLowerCase()}`);
        const snapshot = await get(usernameRef);
        if (!snapshot.exists()) {
            setError('User not found.');
            return;
        }
        
        const targetUser = snapshot.val();
        if (targetUser.uid === auth.currentUser?.uid) {
            setError("You can't add yourself.");
            return;
        }

        const requestRef = ref(db, `requests/${targetUser.uid}`);
        const newRequestRef = push(requestRef);
        await set(newRequestRef, {
            from: auth.currentUser?.uid,
            fromUsername: profile.username,
            fromPhotoURL: profile.photoURL,
            ts: serverTimestamp()
        });

        setSuccess(`Friend request sent to @${username}!`);
        setUsername('');
    };

    return (
        <Modal title="Add Friend" onClose={onClose}>
            <input 
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter friend's username"
                className="w-full p-2 border-b-2 border-green-500 dark:border-green-400 focus:outline-none bg-transparent dark:text-white"
            />
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            {success && <p className="text-green-500 text-sm mt-2">{success}</p>}
            <div className="mt-4 flex justify-end space-x-2">
                <button onClick={onClose} className="px-4 py-2 text-green-600 dark:text-green-400 rounded hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold">Cancel</button>
                <button onClick={handleSendRequest} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 font-semibold">Send Request</button>
            </div>
        </Modal>
    );
}

const ProfileModal: React.FC<{user: User, profile: UserProfile, onClose: () => void, onNavigateToSettings: () => void, onNavigateToAdmin: () => void}> = ({ user, profile, onClose, onNavigateToSettings, onNavigateToAdmin }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(profile.name || '');
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleLogout = () => {
        auth.signOut();
        onClose();
    };
    
    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setIsUploading(true);
        try {
            const fileRef = storageRef(storage, `avatars/${user.uid}`);
            await uploadBytes(fileRef, file);
            const photoURL = await getDownloadURL(fileRef);
            
            await update(ref(db, `users/${user.uid}`), { photoURL });
        } catch (error) {
            console.error("Error uploading profile picture:", error);
            alert("Failed to upload image. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };
    
    const handleUpdateName = async () => {
        if (!editedName.trim() || !user || editedName.trim() === profile.name) {
            setIsEditing(false);
            return;
        }
        try {
            await update(ref(db, `users/${user.uid}`), { name: editedName.trim() });
            setIsEditing(false);
        } catch (error) {
            console.error("Error updating name:", error);
            alert("Failed to update name.");
        }
    };

    return (
        <Modal title="Profile" onClose={onClose}>
            <div className="flex flex-col items-center w-full">
                <div className="relative cursor-pointer" onClick={handleAvatarClick} title="Change profile picture">
                    <Avatar photoURL={profile.photoURL} username={profile.username} className="w-24 h-24 text-4xl" />
                    {isUploading && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                            <div className="w-6 h-6 border-4 border-t-transparent border-white rounded-full animate-spin"></div>
                        </div>
                    )}
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                
                {isEditing ? (
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onBlur={handleUpdateName}
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdateName()}
                      className="mt-4 w-full text-center text-xl font-bold border-b-2 border-green-500 dark:border-green-400 focus:outline-none bg-transparent dark:text-white"
                      autoFocus
                    />
                ) : (
                    <p className="mt-4 font-bold text-xl text-gray-800 dark:text-gray-100">{profile.name}</p>
                )}

                <div className="mt-4 w-full border-t dark:border-gray-700 pt-4 text-gray-800 dark:text-gray-200">
                    <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-500 dark:text-gray-400">Username</span>
                        <span className="font-medium">@{profile.username}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                        <span className="font-semibold text-gray-500 dark:text-gray-400">Email</span>
                        <span className="text-sm">{user.email}</span>
                    </div>
                </div>
            </div>
            <div className="mt-6 flex justify-between w-full items-center">
                <div className="flex space-x-1">
                     <button onClick={() => { onClose(); onNavigateToSettings(); }} className="p-2 text-gray-500 dark:text-gray-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Settings">
                        <CogIcon className="w-6 h-6"/>
                     </button>
                     {profile.isAdmin && (
                        <button onClick={() => { onClose(); onNavigateToAdmin(); }} className="p-2 text-gray-500 dark:text-gray-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Admin Panel">
                            <ShieldCheckIcon className="w-6 h-6" />
                        </button>
                     )}
                </div>
                 <div className="flex space-x-2">
                    {isEditing ? (
                        <>
                            <button onClick={() => { setIsEditing(false); setEditedName(profile.name); }} className="px-4 py-2 text-green-600 dark:text-green-400 rounded hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold">Cancel</button>
                            <button onClick={handleUpdateName} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 font-semibold">Save</button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setIsEditing(true)} className="px-4 py-2 text-green-600 dark:text-green-400 rounded hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold">Edit Name</button>
                            <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold">Logout</button>
                        </>
                    )}
                 </div>
            </div>
        </Modal>
    );
}

const IncomingCallModal: React.FC<{ call: Call, onAccept: () => void, onReject: () => void }> = ({ call, onAccept, onReject }) => {
    return (
        <Modal title="Incoming Call" onClose={onReject}>
            <div className="flex flex-col items-center">
                <Avatar photoURL={call.fromPhotoURL} username={call.fromUsername} className="w-24 h-24 text-4xl mb-4" />
                <p className="text-center text-lg text-gray-800 dark:text-gray-200">
                    <span className="font-semibold">@{call.fromUsername}</span> is starting a {call.type} call.
                </p>
            </div>
            <div className="mt-6 flex justify-center space-x-4">
                <button onClick={onReject} className="px-6 py-3 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 transition-transform hover:scale-105">Reject</button>
                <button onClick={onAccept} className="px-6 py-3 bg-green-600 text-white rounded-full font-semibold hover:bg-green-700 transition-transform hover:scale-105">Accept</button>
            </div>
        </Modal>
    );
}

const Modal: React.FC<React.PropsWithChildren<{title: string, onClose: () => void}>> = ({ title, onClose, children }) => (
    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animation-fade-in">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm animation-scale-in">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{title}</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl font-bold">&times;</button>
            </div>
            {children}
        </div>
    </div>
);

export default MainScreen;