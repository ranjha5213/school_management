import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      setSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      setConnected(false);
      return;
    }

    const token = localStorage.getItem('token');
    const url =
      import.meta.env.VITE_SOCKET_URL ||
      `${window.location.protocol}//${window.location.hostname}:5000`;

    const clientSocket = io(url, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });

    clientSocket.on('connect', () => {
      console.log('[socket] connected', clientSocket.id);
      setConnected(true);
    });
    clientSocket.on('disconnect', (reason) => {
      console.log('[socket] disconnected', reason);
      setConnected(false);
    });
    clientSocket.on('connect_error', (err) => {
      console.warn('[socket] error', err.message);
    });

    // ─── Global toast notifications (in addition to badge updates) ───
    clientSocket.on('homework:new', (p) => {
      toast(`📚 New homework: ${p.title}`, { id: 'socket-hw-new', duration: 5000 });
    });
    clientSocket.on('homework:graded', (p) => {
      toast.success(`✅ Homework graded: ${p.grade}`, { id: 'socket-hw-graded', duration: 5000 });
    });
    clientSocket.on('exam:marks-posted', (p) => {
      toast(`📝 Marks posted for ${p.exam_name}`, { id: 'socket-exam-marks', duration: 5000 });
    });
    clientSocket.on('fee:payment', (p) => {
      toast.success(`💵 Payment received: $${p.amount}`, { id: 'socket-fee-payment', duration: 4000 });
    });

    setSocket(clientSocket);

    return () => {
      clientSocket.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);

