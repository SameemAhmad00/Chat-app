
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { ref, onValue, off, serverTimestamp, set, onDisconnect, remove } from 'firebase/database';
import { auth, db } from './services/firebase';
import type { UserProfile, Contact, Call, FriendRequest } from './types';
import AuthScreen from './components/AuthScreen';
import MainScreen from './components/MainScreen';
import ChatScreen from './components/ChatScreen';
import CallScreen from './components/CallScreen';
import SettingsScreen from './components/SettingsScreen';
import AdminScreen from './components/AdminScreen';
import AdminChatViewer from './components/AdminChatViewer';
import { rtcConfig } from './constants';
import { endCall, setupCallListeners, startOutgoingCall, acceptIncomingCall } from './services/webrtc';


type View = 'auth' | 'main' | 'chat' | 'call' | 'settings' | 'admin' | 'adminChatViewer';
export type ActiveCall = {
  id: string;
  type: 'video' | 'voice';
  partner: Contact;
  role: 'caller' | 'callee';
  status: 'connecting' | 'connected' | 'ended';
};

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  const [view, setView] = useState<View>('auth');
  const [chatPartner, setChatPartner] = useState<Contact | null>(null);
  const [selectedUserForAdminView, setSelectedUserForAdminView] = useState<UserProfile | null>(null);

  // WebRTC State
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const callListenersRef = useRef<(() => void)[]>([]);

  const cleanupWebRTC = useCallback(() => {
    endCall(peerConnectionRef, localStream, activeCall, user, db);
    
    callListenersRef.current.forEach(unsubscribe => unsubscribe());
    callListenersRef.current = [];

    setActiveCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setView(currentView => (currentView === 'call' ? 'main' : currentView));
  }, [localStream, activeCall, user]);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const profileRef = ref(db, `users/${user.uid}`);
        const unsubscribeProfile = onValue(profileRef, (snapshot) => {
          if (snapshot.exists()) {
            const userProfile = snapshot.val() as UserProfile;
            
            if (userProfile.isBlockedByAdmin) {
                auth.signOut(); // Force sign out if blocked
                return;
            }
            
            setUser(user);
            setProfile(userProfile);
            // Don't change view if it's already set by user action e.g., in call
            setView(currentView => (currentView === 'auth' || currentView === 'main' ? 'main' : currentView));

          } else {
             setUser(user); // User exists but no profile, AuthScreen will handle setup
             setProfile(null);
             setView('auth');
          }
          setIsLoading(false);
        });
        return () => unsubscribeProfile();
      } else {
        setUser(null);
        setProfile(null);
        setView('auth');
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Manage user presence
  useEffect(() => {
    if (!user) return;

    const userPresenceRef = ref(db, `presence/${user.uid}`);
    const connectedRef = ref(db, '.info/connected');

    const listener = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        set(userPresenceRef, 'online');
        // onDisconnect will set the value at userPresenceRef when the client disconnects
        onDisconnect(userPresenceRef).set(serverTimestamp());
      }
    });

    return () => {
        // Mark user as offline when they log out or the component unmounts
        set(userPresenceRef, serverTimestamp());
        off(connectedRef, 'value', listener);
    };
  }, [user]);

  // Listen for incoming calls
  useEffect(() => {
    if (!user || !profile) return;
    const callsRef = ref(db, `calls/${user.uid}`);
    
    const listener = onValue(callsRef, (snapshot) => {
      const calls = snapshot.val();
      if (calls) {
        const [callId, callData] = Object.entries(calls)[0] as [string, Call];
        const isBlocked = profile.blocked && profile.blocked[callData.from];
        if (!activeCall && !isBlocked) {
          setIncomingCall({ ...callData, id: callId });
        } else if (isBlocked) {
          // Auto-reject
          remove(ref(db, `calls/${user.uid}/${callId}`));
        }
      } else {
        setIncomingCall(null);
      }
    });

    return () => off(callsRef, 'value', listener);
  }, [user, profile, activeCall]);

  const handleStartCall = async (partner: Contact, type: 'video' | 'voice') => {
    if (!user || !profile) return;
    setView('call');
    const unsubscribers = await startOutgoingCall(user, profile, partner, type, db, peerConnectionRef, setLocalStream, setRemoteStream, setActiveCall, cleanupWebRTC);
    callListenersRef.current = unsubscribers;
  };

  const handleAcceptCall = async () => {
    if (!incomingCall || !user || !profile) return;
    setIncomingCall(null);
    setView('call');
    const unsubscribers = await acceptIncomingCall(user, profile, incomingCall, db, peerConnectionRef, setLocalStream, setRemoteStream, setActiveCall, cleanupWebRTC);
    callListenersRef.current = unsubscribers;
  };

  const handleRejectCall = () => {
    if (incomingCall && user) {
      remove(ref(db, `calls/${user.uid}/${incomingCall.id}`));
      setIncomingCall(null);
    }
  };

  const handleEndCall = () => {
    cleanupWebRTC();
    setView('main');
  };

  const handleSelectChat = (partner: Contact) => {
    setChatPartner(partner);
    setView('chat');
  };

  const handleBackToMain = () => {
    setChatPartner(null);
    setView('main');
  };
  
  const handleBackToAdmin = () => {
    setSelectedUserForAdminView(null);
    setView('admin');
  };

  const handleProfileSetupComplete = (newProfile: UserProfile) => {
    setProfile(newProfile);
    setView('main');
  }

  const handleNavigateToSettings = () => {
    setView('settings');
  };
  
  const handleNavigateToAdmin = () => {
    if (profile?.isAdmin) {
        setView('admin');
    }
  }
  
  const handleAdminViewUserChats = (userToView: UserProfile) => {
    setSelectedUserForAdminView(userToView);
    setView('adminChatViewer');
  };

  const renderContent = () => {
    if (isLoading) {
      return <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-black text-gray-800 dark:text-gray-200">Loading...</div>;
    }

    if (view === 'call' && activeCall && profile) {
        return <CallScreen
            profile={profile}
            activeCall={activeCall}
            localStream={localStream}
            remoteStream={remoteStream}
            onEndCall={handleEndCall}
        />
    }
    
    if (user && profile && view === 'settings') {
      return <SettingsScreen user={user} profile={profile} onBack={handleBackToMain} />;
    }
    
    if (user && profile && profile.isAdmin && view === 'admin') {
      return <AdminScreen currentUserProfile={profile} onBack={handleBackToMain} onViewUserChats={handleAdminViewUserChats} />;
    }
    
    if (user && profile && profile.isAdmin && view === 'adminChatViewer' && selectedUserForAdminView) {
      return <AdminChatViewer adminUser={profile} viewedUser={selectedUserForAdminView} onBack={handleBackToAdmin} />;
    }

    if (user && profile && view === 'main') {
      return (
        <MainScreen
          user={user}
          profile={profile}
          onSelectChat={handleSelectChat}
          onStartCall={handleStartCall}
          onNavigateToSettings={handleNavigateToSettings}
          onNavigateToAdmin={handleNavigateToAdmin}
          incomingCall={incomingCall}
          onAcceptCall={handleAcceptCall}
          onRejectCall={handleRejectCall}
        />
      );
    }

    if (user && profile && view === 'chat' && chatPartner) {
      return <ChatScreen user={user} profile={profile} partner={chatPartner} onBack={handleBackToMain} onStartCall={handleStartCall} />;
    }

    return <AuthScreen onProfileSetupComplete={handleProfileSetupComplete} user={user} />;
  };

  return (
    <div className="bg-gray-200 dark:bg-gray-900 flex items-center justify-center w-screen h-screen">
      <div className="bg-gray-100 dark:bg-black w-full h-full max-w-md max-h-[950px] shadow-2xl rounded-lg overflow-hidden flex flex-col relative">
        {renderContent()}
      </div>
    </div>
  );
};

export default App;