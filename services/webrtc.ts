
import type { MutableRefObject } from 'react';
// FIX: Use firebase v9 compat imports to resolve module errors.
import firebase from 'firebase/compat/app';
import { rtcConfig } from '../constants';
// FIX: Use User and Database types from firebase compat library.
import type { UserProfile, Contact, Call } from '../types';
import type { ActiveCall } from '../App';

type PeerConnectionRef = MutableRefObject<RTCPeerConnection | null>;
type User = firebase.User;
type Database = firebase.database.Database;

export const startOutgoingCall = async (
  user: User,
  profile: UserProfile,
  partner: Contact,
  type: 'video' | 'voice',
  db: Database,
  pcRef: PeerConnectionRef,
  setLocalStream: (stream: MediaStream | null) => void,
  setRemoteStream: (stream: MediaStream | null) => void,
  setActiveCall: (call: ActiveCall | null) => void,
  cleanup: () => void
): Promise<(() => void)[]> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      type === 'video' ? { video: true, audio: true } : { audio: true }
    );
    setLocalStream(stream);

    // FIX: Use compat version of ref and push.
    const callId = db.ref(`calls/${partner.uid}`).push().key;
    if (!callId) throw new Error("Failed to create call ID");
    
    // Log call for both users
    // FIX: Use compat version of serverTimestamp.
    const callTimestamp = firebase.database.ServerValue.TIMESTAMP;
    // FIX: Use compat version of ref, push and set.
    const callerLogRef = db.ref(`callLogs/${user.uid}`).push();
    callerLogRef.set({
        partner: { uid: partner.uid, username: partner.username, photoURL: partner.photoURL || null },
        type,
        direction: 'outgoing',
        ts: callTimestamp,
    });
    // FIX: Use compat version of ref, push and set.
    const calleeLogRef = db.ref(`callLogs/${partner.uid}`).push();
    calleeLogRef.set({
        partner: { uid: user.uid, username: profile.username, photoURL: profile.photoURL || null },
        type,
        direction: 'incoming',
        ts: callTimestamp,
    });


    const newActiveCall: ActiveCall = { id: callId, partner, type, role: 'caller', status: 'connecting' };
    setActiveCall(newActiveCall);

    pcRef.current = new RTCPeerConnection(rtcConfig);
    stream.getTracks().forEach(track => pcRef.current?.addTrack(track, stream));

    pcRef.current.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);

    const callPayload: Omit<Call, 'id'> = {
      type,
      from: user.uid,
      fromUsername: profile.username,
      fromPhotoURL: profile.photoURL,
      offer,
      // FIX: Use compat version of serverTimestamp.
      ts: firebase.database.ServerValue.TIMESTAMP as any,
    };
    // FIX: Use compat version of ref and set.
    await db.ref(`calls/${partner.uid}/${callId}`).set(callPayload);
    
    return setupCallListeners(callId, newActiveCall, db, pcRef);

  } catch (error) {
    console.error("Error starting call:", error);
    cleanup();
    return [];
  }
};

export const acceptIncomingCall = async (
  user: User,
  profile: UserProfile,
  incomingCall: Call,
  db: Database,
  pcRef: PeerConnectionRef,
  setLocalStream: (stream: MediaStream | null) => void,
  setRemoteStream: (stream: MediaStream | null) => void,
  setActiveCall: (call: ActiveCall | null) => void,
  cleanup: () => void
): Promise<(() => void)[]> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      incomingCall.type === 'video' ? { video: true, audio: true } : { audio: true }
    );
    setLocalStream(stream);

    const newActiveCall: ActiveCall = { 
      id: incomingCall.id, 
      partner: { uid: incomingCall.from, username: incomingCall.fromUsername, photoURL: incomingCall.fromPhotoURL },
      type: incomingCall.type, 
      role: 'callee', 
      status: 'connecting' 
    };
    setActiveCall(newActiveCall);

    pcRef.current = new RTCPeerConnection(rtcConfig);
    stream.getTracks().forEach(track => pcRef.current?.addTrack(track, stream));

    pcRef.current.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };
    
    await pcRef.current.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);

    // FIX: Use compat version of ref and set.
    await db.ref(`calls/${user.uid}/${incomingCall.id}/answer`).set(answer);

    return setupCallListeners(incomingCall.id, newActiveCall, db, pcRef);
    
  } catch (error) {
    console.error("Error accepting call:", error);
    cleanup();
    return [];
  }
};

export const setupCallListeners = (
  callId: string,
  activeCall: ActiveCall,
  db: Database,
  pcRef: PeerConnectionRef
): (() => void)[] => {
  const pc = pcRef.current;
  if (!pc) return [];

  const unsubscribers: (() => void)[] = [];

  // FIX: Use compat version of ref.
  const iceCandidateRef = db.ref(`iceCandidates/${callId}/${activeCall.role}`);
  pc.onicecandidate = event => {
    if (event.candidate) {
      // FIX: Use compat version of push.
      iceCandidateRef.push(event.candidate.toJSON());
    }
  };
  
  const remoteRole = activeCall.role === 'caller' ? 'callee' : 'caller';
  // FIX: Use compat version of ref.
  const remoteIceCandidateRef = db.ref(`iceCandidates/${callId}/${remoteRole}`);
  // FIX: Use compat version of onChildAdded.
  const iceCallback = (snapshot: firebase.database.DataSnapshot) => {
    if (snapshot.exists()) {
      pc.addIceCandidate(new RTCIceCandidate(snapshot.val())).catch(e => console.error("Error adding ICE candidate:", e));
    }
  };
  remoteIceCandidateRef.on('child_added', iceCallback);
  unsubscribers.push(() => remoteIceCandidateRef.off('child_added', iceCallback));

  if (activeCall.role === 'caller') {
    // FIX: Use compat version of ref.
    const answerRef = db.ref(`calls/${activeCall.partner.uid}/${callId}/answer`);
    // FIX: Use compat version of onValue.
    const answerCallback = async (snapshot: firebase.database.DataSnapshot) => {
      if (snapshot.exists()) {
        const answer = snapshot.val();
        if (pc.signalingState !== 'stable' && pc.remoteDescription === null) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      }
    };
    answerRef.on('value', answerCallback);
    unsubscribers.push(() => answerRef.off('value', answerCallback));
  }

  return unsubscribers;
};

export const endCall = (
  pcRef: PeerConnectionRef,
  localStream: MediaStream | null,
  activeCall: ActiveCall | null,
  user: User | null,
  db: Database,
) => {
  pcRef.current?.close();
  pcRef.current = null;
  localStream?.getTracks().forEach(track => track.stop());
  
  if (activeCall && user) {
    const callRefPath = activeCall.role === 'caller' 
      ? `calls/${activeCall.partner.uid}/${activeCall.id}`
      // Callee is listening on their own UID for calls
      : `calls/${user.uid}/${activeCall.id}`;
      
    // FIX: Use compat version of ref and remove.
    db.ref(callRefPath).remove();
    db.ref(`iceCandidates/${activeCall.id}`).remove();
  }
};
