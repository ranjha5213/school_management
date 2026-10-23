import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const token = localStorage.getItem('token');
    const url = import.meta.env.VITE_SOCKET_URL
      || `${window.location.protocol}//${window.location.hostname}:5000`;

    const socket = io(url, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      console.log('[socket] connected', socket.id);
      setConnected(true);
    });
    socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected', reason);
      setConnected(false);
    });
    socket.on('connect_error', (err) => {
      console.warn('[socket] error', err.message);
    });

    // ─── Global toast notifications (in addition to badge updates) ───
    socket.on('homework:new', (p) => {
      toast(`📚 New homework: ${p.title}`, { duration: 5000 });
    });
    socket.on('homework:graded', (p) => {
      toast.success(`✅ Homework graded: ${p.grade}`, { duration: 5000 });
    });
    socket.on('exam:marks-posted', (p) => {
      toast(`📝 Marks posted for ${p.exam_name}`, { duration: 5000 });
    });
    socket.on('fee:payment', (p) => {
      toast.success(`💵 Payment received: $${p.amount}`, { duration: 4000 });
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
