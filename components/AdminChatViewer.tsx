
import React, { useState, useEffect } from 'react';
import { ref, onValue, query, orderByChild } from 'firebase/database';
import { db } from '../services/firebase';
import type { UserProfile, Contact, Message } from '../types';
import { BackIcon, DownloadIcon } from './Icons';
import Avatar from './Avatar';

// Props for the main viewer component
interface AdminChatViewerProps {
  adminUser: UserProfile;
  viewedUser: UserProfile;
  onBack: () => void;
}

// Props for the chat thread view
interface AdminChatThreadProps {
  viewedUser: UserProfile;
  chatPartner: Contact;
  onBack: () => void;
}

// Props for the contact list view
interface AdminContactListProps {
  viewedUser: UserProfile;
  onSelectChat: (partner: Contact) => void;
}

const AdminChatViewer: React.FC<AdminChatViewerProps> = ({ adminUser, viewedUser, onBack }) => {
  const [selectedChatPartner, setSelectedChatPartner] = useState<Contact | null>(null);

  if (selectedChatPartner) {
    return (
      <AdminChatThread
        viewedUser={viewedUser}
        chatPartner={selectedChatPartner}
        onBack={() => setSelectedChatPartner(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-black text-gray-800 dark:text-gray-100 p-3 flex items-center shadow-sm z-10">
        <button onClick={onBack} className="p-2 text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
          <BackIcon className="w-6 h-6" />
        </button>
        <div className="ml-3">
          <h2 className="font-bold text-lg">Viewing Chats for:</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">@{viewedUser.username}</p>
        </div>
      </header>
      <AdminContactList viewedUser={viewedUser} onSelectChat={setSelectedChatPartner} />
    </div>
  );
};

const AdminContactList: React.FC<AdminContactListProps> = ({ viewedUser, onSelectChat }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const contactsRef = ref(db, `contacts/${viewedUser.uid}`);
    const unsubscribe = onValue(contactsRef, (snapshot) => {
      const contactsData = snapshot.val() || {};
      const contactList: Contact[] = Object.values(contactsData);
      setContacts(contactList);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [viewedUser.uid]);

  if (isLoading) {
    return <div className="text-center p-4 text-gray-500 dark:text-gray-400">Loading contacts...</div>;
  }

  if (contacts.length === 0) {
    return <div className="text-center p-4 text-gray-500 dark:text-gray-400">This user has no contacts.</div>;
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {contacts.map((contact) => (
          <div key={contact.uid} className="flex items-center p-3 hover:bg-gray-200 dark:hover:bg-gray-800 cursor-pointer" onClick={() => onSelectChat(contact)}>
            <Avatar photoURL={contact.photoURL} username={contact.username} />
            <div className="flex-1 ml-4 overflow-hidden">
              <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{contact.username}</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
};

const AdminChatThread: React.FC<AdminChatThreadProps> = ({ viewedUser, chatPartner, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const chatId = [viewedUser.uid, chatPartner.uid].sort().join('_');

  useEffect(() => {
    const messagesRef = query(ref(db, `messages/${chatId}`), orderByChild('ts'));
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val() || {};
      const messageList: Message[] = Object.keys(data).map(key => ({ ...data[key], id: key }));
      setMessages(messageList);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  const handleExportChat = () => {
    let chatContent = `Chat history between @${viewedUser.username} and @${chatPartner.username}\n`;
    chatContent += `Exported on: ${new Date().toLocaleString()}\n\n`;

    messages.forEach(msg => {
      const senderUsername = msg.from === viewedUser.uid ? viewedUser.username : chatPartner.username;
      const timestamp = new Date(msg.ts).toLocaleString();
      chatContent += `[${timestamp}] @${senderUsername}: ${msg.text}\n`;
    });

    const blob = new Blob([chatContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chat_${viewedUser.username}_${chatPartner.username}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-gray-200 dark:bg-gray-800">
      <header className="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-3 flex items-center shadow-sm z-10">
        <button onClick={onBack} className="p-2 text-green-600 dark:text-green-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
          <BackIcon className="w-6 h-6" />
        </button>
        <Avatar photoURL={chatPartner.photoURL} username={chatPartner.username} className="w-10 h-10 ml-2" />
        <div className="flex-1 ml-3">
          <h2 className="font-bold text-lg leading-tight">{chatPartner.username}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Chat with {viewedUser.username}</p>
        </div>
        <button onClick={handleExportChat} className="p-2 text-green-600 dark:text-green-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full" title="Export Chat">
          <DownloadIcon className="w-6 h-6" />
        </button>
      </header>
      
      <main className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="text-center p-4 text-gray-500 dark:text-gray-400">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center p-4 text-gray-500 dark:text-gray-400">No messages in this chat.</div>
        ) : (
          messages.map((msg) => {
            const isFromViewedUser = msg.from === viewedUser.uid;
            return (
              <div key={msg.id} className={`flex ${isFromViewedUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs md:max-w-md lg:max-w-lg px-3 py-2 rounded-lg shadow-sm relative ${isFromViewedUser ? 'bg-green-100 dark:bg-green-800' : 'bg-white dark:bg-gray-700'} text-gray-800 dark:text-gray-100`}>
                  <p className="pb-1">{msg.text}</p>
                  <div className="text-right text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {msg.editedAt && <span className="italic mr-1">edited</span>}
                    {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </main>
    </div>
  );
};

export default AdminChatViewer;
