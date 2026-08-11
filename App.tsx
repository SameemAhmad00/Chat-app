
import React, { useState, useEffect, useCallback, useRef } from 'react';
import firebase from 'firebase/compat/app';
import { auth, db } from './services/firebase';
import type { UserProfile, Contact, Call, CallRecord } from './types';
import AuthScreen from './components/AuthScreen';
import MainScreen from './components/MainScreen';
import ChatScreen from './components/ChatScreen';
import CallScreen from './components/CallScreen';
import SettingsScreen from './components/SettingsScreen';
import AdminScreen from './components/AdminScreen';
import AdminChatViewer from './components/AdminChatViewer';
import AdminUserDetail from './components/AdminUserDetail';
import { useTheme } from './contexts/ThemeContext';


import { endCall, startOutgoingCall, acceptIncomingCall } from './services/webrtc';
import { setupNotifications } from './services/notifications';
import { App as CapacitorApp } from '@capacitor/app';

export type NavigationState =
  | { view: 'auth' }
  | { view: 'main' }
  | { view: 'chat'; partner: Contact }
  | { view: 'call'; activeCall: ActiveCall }
  | { view: 'settings' }
  | { view: 'admin' }

  | { view: 'adminChatViewer'; viewedUser: UserProfile }
  | { view: 'adminUserDetail'; viewedUser: UserProfile }
  ;

export type ActiveCall = {
  id: string;
  type: 'video' | 'voice';
  partner: Contact;
  role: 'caller' | 'callee';
  status: 'connecting' | 'connected' | 'ended';
};

const App: React.FC = () => {
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<firebase.User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [navigationStack, setNavigationStack] = useState<NavigationState[]>([{ view: 'auth' }]);

  // WebRTC State
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const callListenersRef = useRef<(() => void)[]>([]);

  // PWA Install Prompt State
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  // App Exit Status
  const [showExitToast, setShowExitToast] = useState(false);
  const lastBackPressRef = useRef<number>(0);

  const pushView = (state: NavigationState) => {
    setNavigationStack(stack => [...stack, state]);
  };

  const popView = () => {
    setNavigationStack(stack => (stack.length > 1 ? stack.slice(0, -1) : stack));
  };

  const resetToView = (state: NavigationState) => {
    setNavigationStack([state]);
  };

  const currentNavigationState = navigationStack[navigationStack.length - 1];
  const activeCall = currentNavigationState.view === 'call' ? currentNavigationState.activeCall : null;


  const cleanupWebRTC = useCallback(() => {
    endCall(peerConnectionRef, localStream, activeCall, user, db);

    callListenersRef.current.forEach(unsubscribe => unsubscribe());
    callListenersRef.current = [];

    setLocalStream(null);
    setRemoteStream(null);
  }, [localStream, activeCall, user]);

  // Handle browser back button
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (navigationStack.length > 1) {
        popView();
      }
    };

    const handleHardwareBack = () => {
      if (navigationStack.length > 1) {
        popView();
        window.history.back(); // keep web history in sync
      } else {
        const currentTime = new Date().getTime();
        if (currentTime - lastBackPressRef.current < 2000) {
          CapacitorApp.exitApp();
        } else {
          setShowExitToast(true);
          lastBackPressRef.current = currentTime;
          setTimeout(() => setShowExitToast(false), 2000);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    const backListener = CapacitorApp.addListener('backButton', handleHardwareBack);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      backListener.then(listener => listener.remove());
    };
  }, [navigationStack.length]);

  // Push state to history when navigation stack grows
  useEffect(() => {
    if (navigationStack.length > 1) {
      // Only push if the current state is not already at the top of the history
      // This is a simple heuristic for this stack-based navigation
      window.history.pushState({ stackLength: navigationStack.length }, '');
    }
  }, [navigationStack.length]);


  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (user) {
        const profileRef = db.ref(`users/${user.uid}`);
        const profileListener = (snapshot: firebase.database.DataSnapshot) => {
          if (snapshot.exists()) {
            const userProfile = snapshot.val() as UserProfile;

            if (userProfile.isBlockedByAdmin) {
              auth.signOut();
              return;
            }

            setUser(user);
            setProfile(userProfile);

            setNavigationStack(stack => {
              if (stack[stack.length - 1].view === 'auth') {
                return [{ view: 'main' }];
              }
              return stack;
            });

          } else {
            setUser(user);
            setProfile(null);
            setNavigationStack([{ view: 'auth' }]);
          }
          setIsLoading(false);
        };
        profileRef.on('value', profileListener);
        unsubscribeProfile = () => profileRef.off('value', profileListener);
      } else {
        setUser(null);
        setProfile(null);
        setNavigationStack([{ view: 'auth' }]);
        setIsLoading(false);
      }
    });
    return () => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
      unsubscribe();
    };
  }, []);

  // Manage user presence
  useEffect(() => {
    if (!user) return;
    const userPresenceRef = db.ref(`presence/${user.uid}`);
    const connectedRef = db.ref('.info/connected');
    const listener = connectedRef.on('value', (snap) => {
      if (snap.val() === true) {
        userPresenceRef.set('online');
        // onDisconnect will set the value at userPresenceRef when the client disconnects
        userPresenceRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
      }
    });

    return () => {
      // Mark user as offline when they log out or the component unmounts
      userPresenceRef.set(firebase.database.ServerValue.TIMESTAMP);
      db.ref(`users/${user.uid}`).update({ lastActive: firebase.database.ServerValue.TIMESTAMP });
      connectedRef.off('value', listener);
    };
  }, [user]);

  // Setup push notifications
  useEffect(() => {
    // Check if the user is logged in and notifications are supported by the browser
    if (profile && 'Notification' in window) {
      setupNotifications(profile.uid);
    }
  }, [profile]);

  // Listen for PWA install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);


  // Listen for incoming calls
  useEffect(() => {
    if (!user || !profile) return;
    const callsRef = db.ref(`calls/${user.uid}`);
    const listener = callsRef.on('value', (snapshot) => {
      const calls = snapshot.val();
      if (calls) {
        const [callId, callData] = Object.entries(calls)[0] as [string, Call];
        const isBlocked = profile.blocked && profile.blocked[callData.from];
        if (currentNavigationState.view !== 'call' && !isBlocked) {
          setIncomingCall({ ...callData, id: callId });
        } else if (isBlocked) {
          // Auto-reject
          db.ref(`calls/${user.uid}/${callId}`).remove();
        }
      } else {
        setIncomingCall(null);
      }
    });
    return () => callsRef.off('value', listener);
  }, [user, profile, currentNavigationState.view]);

  const handleCallStateChange = useCallback((state: 'connected' | 'disconnected') => {
    setNavigationStack(stack => {
      const top = stack[stack.length - 1];
      if (top.view === 'call') {
        if (state === 'connected' && top.activeCall.status !== 'connected') {
          const newStack = [...stack];
          newStack[newStack.length - 1] = {
            ...top,
            activeCall: { ...top.activeCall, status: 'connected' }
          };
          return newStack;
        } else if (state === 'disconnected' && top.activeCall.status !== 'ended') {
          const newStack = [...stack];
          newStack[newStack.length - 1] = {
            ...top,
            activeCall: { ...top.activeCall, status: 'ended' }
          };
          return newStack;
        }
      }
      return stack;
    });
  }, []);

  const handleStartCall = async (partner: Contact, type: 'video' | 'voice') => {
    if (!user || !profile) return;

    const { activeCall: newActiveCall, unsubscribers } = await startOutgoingCall(user, profile, partner, type, db, peerConnectionRef, setLocalStream, setRemoteStream, cleanupWebRTC, handleCallStateChange);
    if (newActiveCall && unsubscribers) {
      pushView({ view: 'call', activeCall: newActiveCall });
      callListenersRef.current = unsubscribers;
    } else {
      alert("Unable to start call. Please ensure microphone and camera permissions are granted.");
    }
  };

  const handleAcceptCall = async () => {
    if (!incomingCall || !user || !profile) return;
    setIncomingCall(null);
    const { activeCall: newActiveCall, unsubscribers } = await acceptIncomingCall(user, profile, incomingCall, db, peerConnectionRef, setLocalStream, setRemoteStream, cleanupWebRTC, handleCallStateChange);
    if (newActiveCall && unsubscribers) {
      pushView({ view: 'call', activeCall: newActiveCall });
      callListenersRef.current = unsubscribers;
    } else {
      alert("Unable to accept call. Please ensure microphone and camera permissions are granted.");
    }
  };

  const handleRejectCall = () => {
    if (incomingCall && user) {
      db.ref(`calls/${user.uid}/${incomingCall.id}`).remove();
      setIncomingCall(null);
    }
  };

  const handleEndCall = (duration: number) => {
    if (user && activeCall && duration > 0) {
      // Find the call log and update it with the duration
      const callLogsRef = db.ref(`callLogs/${user.uid}`);
      callLogsRef.orderByChild('ts').limitToLast(5).once('value', (snapshot) => {
        const logs = snapshot.val();
        if (logs) {
          // Find the most recent log with this partner that has no duration yet.
          const logEntries = Object.entries(logs) as [string, CallRecord][];
          const callLogToUpdate = logEntries
            .sort(([, a], [, b]) => b.ts - a.ts)
            .find(([, log]) => log.partner.uid === activeCall.partner.uid && log.duration === undefined);

          if (callLogToUpdate) {
            const [logId] = callLogToUpdate;
            db.ref(`callLogs/${user.uid}/${logId}`).update({ duration });
          }
        }
      });
    }
    cleanupWebRTC();
    resetToView({ view: 'main' });
  };

  const handleProfileSetupComplete = (newProfile: UserProfile) => {
    setProfile(newProfile);
    resetToView({ view: 'main' });
  }

  const handleInstallClick = () => {
    if (!installPrompt) {
      return;
    }
    // Show the browser's installation prompt
    installPrompt.prompt();
    // Wait for the user to respond and then clear the prompt
    installPrompt.userChoice.then(() => {
      setInstallPrompt(null);
    });
  };

  const renderContent = () => {
    if (isLoading) {
      return <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-black text-gray-800 dark:text-gray-200">Loading...</div>;
    }

    switch (currentNavigationState.view) {
      case 'auth':
        return <AuthScreen onProfileSetupComplete={handleProfileSetupComplete} user={user} />;

      case 'main':
        if (user && profile) {
          return (
            <MainScreen
              user={user}
              profile={profile}
              onNavigate={(state) => pushView(state)}
              onStartCall={handleStartCall}
              incomingCall={incomingCall}
              onAcceptCall={handleAcceptCall}
              onRejectCall={handleRejectCall}
              installPrompt={installPrompt}
              onInstallClick={handleInstallClick}
            />
          );
        }
        return null; // Or a loading/error state

      case 'chat':
        if (user && profile) {
          return (
            <ChatScreen
              user={user}
              profile={profile}
              partner={currentNavigationState.partner}
              onBack={popView}
              onStartCall={handleStartCall}
            />
          );
        }
        return null;

      case 'call':
        if (profile) {
          return (
            <CallScreen
              profile={profile}
              activeCall={currentNavigationState.activeCall}
              localStream={localStream}
              remoteStream={remoteStream}
              onEndCall={handleEndCall}
            />
          );
        }
        return null;

      case 'settings':
        if (user && profile) {
          return <SettingsScreen user={user} profile={profile} onBack={popView} />;
        }
        return null;

      case 'admin':
        if (profile) {
          return <AdminScreen currentUserProfile={profile} onBack={popView} onNavigate={(state) => pushView(state)} />;
        }
        return null;

      case 'adminChatViewer':
        if (user && profile) {
          return <AdminChatViewer adminUser={profile} viewedUser={currentNavigationState.viewedUser} onBack={popView} />;
        }
        return null;

      case 'adminUserDetail':
        if (profile) {
          return <AdminUserDetail currentUserProfile={profile} viewedUser={currentNavigationState.viewedUser} onBack={popView} onNavigate={pushView} />;
        }
        return null;





      default:
        return <AuthScreen onProfileSetupComplete={handleProfileSetupComplete} user={user} />;
    }
  };

  return (
    <div className={`${theme === 'glass' ? 'bg-transparent' : 'bg-gray-200 dark:bg-gray-900'} flex items-center justify-center w-screen h-screen`}>
      <div className={`${theme === 'glass' ? 'bg-transparent shadow-none border-none' : 'bg-gray-100 dark:bg-black shadow-2xl'} w-full h-full max-w-md max-h-[950px] rounded-lg overflow-hidden flex flex-col relative`}>
        {renderContent()}
      </div>
      {showExitToast && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium pointer-events-none transition-opacity duration-300">
          Press back again to exit
        </div>
      )}
    </div>
  );
};

export default App;
