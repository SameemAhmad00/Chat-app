
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import firebase from 'firebase/compat/app';
import { auth, db } from '../services/firebase';
import type { UserProfile } from '../types';
import { MailIcon, LockIcon, UserIcon, AtSymbolIcon, ChatIcon } from './Icons';

interface AuthScreenProps {
  onProfileSetupComplete: (profile: UserProfile) => void;
  user: firebase.User | null;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onProfileSetupComplete, user }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

  // Animation states
  const [shakeError, setShakeError] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAuthenticating) {
      interval = setInterval(() => {
        setDotCount(prev => (prev % 3) + 1);
      }, 400);
    } else {
      setDotCount(1);
    }
    return () => clearInterval(interval);
  }, [isAuthenticating]);

  useEffect(() => {
    if (user) {
      const profileRef = db.ref(`users/${user.uid}`);
      profileRef.get().then(snapshot => {
        if (!snapshot.exists()) {
          setNeedsProfileSetup(true);
        }
      });
    } else {
        setNeedsProfileSetup(false);
    }
  }, [user]);
  
  const setAndShakeError = (message: string) => {
    setError(message);
    if (message) {
      setShakeError(true);
      setTimeout(() => setShakeError(false), 600); // Match animation duration in index.html
    }
  };

  const toggleFormType = () => {
    setIsLogin(prev => !prev);
    setError('');
  };

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsAuthenticating(true);
    try {
      if (isLogin) {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const profileSnap = await db.ref(`users/${userCredential.user.uid}`).get();
        if (profileSnap.exists()) {
            const profile = profileSnap.val() as UserProfile;
            if (profile.isBlockedByAdmin) {
                await auth.signOut();
                setAndShakeError('Your account has been suspended.');
                return;
            }
        }
      } else {
        if (name.trim().length < 2) {
            setAndShakeError('Please enter your full name.');
            return;
        }
        if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
            setAndShakeError('Username must be 3–20 chars (a–z, 0–9, _ .)');
            return;
        }
        const usernameRef = db.ref(`usernames/${username.toLowerCase()}`);
        const usernameSnap = await usernameRef.get();
        if(usernameSnap.exists()){
            setAndShakeError('Username is already taken.');
            return;
        }
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const newUserProfile: UserProfile = {
          uid: userCredential.user.uid,
          email: userCredential.user.email || '',
          name: name,
          username: username,
          createdAt: firebase.database.ServerValue.TIMESTAMP as any,
        };
        await db.ref(`users/${userCredential.user.uid}`).set(newUserProfile);
        await db.ref(`usernames/${username.toLowerCase()}`).set({ uid: userCredential.user.uid });
        onProfileSetupComplete(newUserProfile);
      }
    } catch (err: any) {
      setAndShakeError(err.message.replace('Firebase: ', ''));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setIsAuthenticating(true);
    try {
      if (name.trim().length < 2) {
          setAndShakeError('Please enter your full name.');
          return;
      }
      if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
          setAndShakeError('Username must be 3–20 chars (a–z, 0–9, _ .)');
          return;
      }
      const usernameRef = db.ref(`usernames/${username.toLowerCase()}`);
      const usernameSnap = await usernameRef.get();
      if(usernameSnap.exists()){
          setAndShakeError('Username is already taken.');
          return;
      }
      const newUserProfile: UserProfile = {
          uid: user.uid,
          email: user.email || '',
          name: name,
          username: username,
          createdAt: firebase.database.ServerValue.TIMESTAMP as any,
      };
      await db.ref(`users/${user.uid}`).set(newUserProfile);
      await db.ref(`usernames/${username.toLowerCase()}`).set({ uid: user.uid });
      onProfileSetupComplete(newUserProfile);
    } catch (err: any) {
      setAndShakeError(err.message.replace('Firebase: ', ''));
    } finally {
      setIsAuthenticating(false);
    }
  }

  const renderFormContent = (title: string, submitText: string, handler: (e: React.FormEvent) => void, children: React.ReactNode) => (
      <div className="flex items-center justify-center min-h-full p-4 bg-gray-100 dark:bg-black">
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-md space-y-8"
        >
            <motion.div 
                layout
                className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg relative overflow-hidden"
            >
                <div className="text-center mb-8">
                    <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.1, type: 'spring', bounce: 0.5 }}
                    >
                        <ChatIcon className="w-12 h-12 mx-auto text-green-500" />
                    </motion.div>
                    <motion.h1 
                        layout="position"
                        className="text-2xl font-bold text-gray-800 dark:text-gray-100 mt-4"
                    >
                        Sameem Chat
                    </motion.h1>
                    <motion.p layout="position" className="text-gray-600 dark:text-gray-400">{title}</motion.p>
                </div>

                <form onSubmit={handler} className="space-y-4 flex flex-col">
                    <AnimatePresence mode="popLayout" initial={false}>
                        {children}
                    </AnimatePresence>
                    <motion.button 
                        layout="position"
                        whileHover={!isAuthenticating ? { scale: 1.02 } : { scale: 0.98 }}
                        whileTap={{ scale: 0.98 }}
                        type="submit" 
                        disabled={isAuthenticating}
                        className={`w-full text-white font-bold py-3 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors flex items-center justify-center ${isAuthenticating ? 'bg-green-500/80 cursor-wait animate-pulse hover:opacity-90 transition-opacity' : 'bg-green-500 hover:bg-green-600'}`}
                    >
                        {isAuthenticating ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="inline-block w-[110px] text-left">Proceeding{'.'.repeat(dotCount)}</span>
                            </>
                        ) : submitText}
                    </motion.button>
                    <AnimatePresence>
                        {error && (
                            <motion.p 
                                layout="position"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto', x: shakeError ? [-10, 10, -10, 10, 0] : 0 }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ x: { duration: 0.4 } }}
                                role="alert" 
                                className="text-red-500 text-sm text-center"
                            >
                                {error}
                            </motion.p>
                        )}
                    </AnimatePresence>
                </form>

                {!needsProfileSetup && (
                     <motion.p layout="position" className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
                        {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                        <button onClick={toggleFormType} type="button" className="font-medium text-green-600 hover:text-green-500 dark:text-green-400 dark:hover:text-green-500">
                           {isLogin ? 'Sign up' : 'Log in'}
                        </button>
                    </motion.p>
                )}
            </motion.div>
        </motion.div>
    </div>
  );

  if (needsProfileSetup) {
    return renderFormContent("Setup Your Profile", "Save Profile", handleProfileSetup, (
        <>
            <InputWithIcon Icon={UserIcon} type="text" value={name} onChange={setName} placeholder="Full Name" required />
            <InputWithIcon Icon={AtSymbolIcon} type="text" value={username} onChange={setUsername} placeholder="Choose a unique username" required />
        </>
    ));
  }

  return renderFormContent(
    isLogin ? "Welcome back! Please log in." : "Create your account.",
    isLogin ? "Log In" : "Sign Up",
    handleAuthAction,
    <>
        {!isLogin && (
            <>
                <InputWithIcon Icon={UserIcon} type="text" value={name} onChange={setName} placeholder="Full Name" required />
                <InputWithIcon Icon={AtSymbolIcon} type="text" value={username} onChange={setUsername} placeholder="Username" required />
            </>
        )}
        <InputWithIcon Icon={MailIcon} type="email" value={email} onChange={setEmail} placeholder="Email address" required />
        <InputWithIcon Icon={LockIcon} type="password" value={password} onChange={setPassword} placeholder="Password" required />
    </>
  );
};

interface InputWithIconProps {
    Icon: React.FC<{className?: string}>;
    type: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    required?: boolean;
}

const InputWithIcon: React.FC<InputWithIconProps> = ({ Icon, type, value, onChange, placeholder, required }) => {
    // Add unique key based on placeholder to help framer-motion distinguish inputs
    return (
        <motion.div 
            key={placeholder}
            layout
            initial={{ opacity: 0, x: -20, height: 0 }}
            animate={{ opacity: 1, x: 0, height: 'auto' }}
            exit={{ opacity: 0, x: 20, height: 0 }}
            transition={{ duration: 0.3 }}
            className="relative"
        >
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Icon className="h-5 w-5 text-gray-400" />
            </div>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label={placeholder}
                className="w-full p-3 pl-10 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-gray-900 dark:text-white"
                required={required}
            />
        </motion.div>
    );
};


export default AuthScreen;
