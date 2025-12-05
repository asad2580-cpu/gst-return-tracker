import { create } from 'zustand';

export type Role = 'admin' | 'staff';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export type GSTStatus = 'Pending' | 'Filed' | 'Late';

export interface Client {
  id: string;
  name: string;
  gstin: string;
  assignedToId: string; // Staff ID
  returns: {
    month: string; // e.g., "2023-10"
    gstr1: GSTStatus;
    gstr3b: GSTStatus;
  }[];
}

// Mock Data
export const mockUsers: User[] = [
  { id: '1', name: 'Aditi Sharma', email: 'aditi@cafirm.com', role: 'admin' },
  { id: '2', name: 'Rahul Verma', email: 'rahul@cafirm.com', role: 'staff' },
  { id: '3', name: 'Priya Singh', email: 'priya@cafirm.com', role: 'staff' },
];

export const mockClients: Client[] = [
  {
    id: 'c1',
    name: 'TechSolutions Pvt Ltd',
    gstin: '27ABCDE1234F1Z5',
    assignedToId: '2', // Rahul
    returns: [
      { month: '2025-01', gstr1: 'Filed', gstr3b: 'Filed' },
      { month: '2025-02', gstr1: 'Filed', gstr3b: 'Pending' },
      { month: '2025-03', gstr1: 'Pending', gstr3b: 'Pending' },
    ],
  },
  {
    id: 'c2',
    name: 'GreenLeaf Traders',
    gstin: '27FGHIJ5678K1Z2',
    assignedToId: '2', // Rahul
    returns: [
      { month: '2025-01', gstr1: 'Filed', gstr3b: 'Filed' },
      { month: '2025-02', gstr1: 'Late', gstr3b: 'Pending' },
      { month: '2025-03', gstr1: 'Pending', gstr3b: 'Pending' },
    ],
  },
  {
    id: 'c3',
    name: 'Sunrise Enterprises',
    gstin: '27KLMNO9012P1Z8',
    assignedToId: '3', // Priya
    returns: [
      { month: '2025-01', gstr1: 'Filed', gstr3b: 'Filed' },
      { month: '2025-02', gstr1: 'Filed', gstr3b: 'Filed' },
      { month: '2025-03', gstr1: 'Filed', gstr3b: 'Pending' },
    ],
  },
  {
    id: 'c4',
    name: 'BlueSky Logistics',
    gstin: '27QRSTU3456V1Z4',
    assignedToId: '3', // Priya
    returns: [
      { month: '2025-01', gstr1: 'Late', gstr3b: 'Late' },
      { month: '2025-02', gstr1: 'Pending', gstr3b: 'Pending' },
      { month: '2025-03', gstr1: 'Pending', gstr3b: 'Pending' },
    ],
  },
];

// Store
interface AppState {
  currentUser: User | null;
  clients: Client[];
  users: User[];
  login: (email: string) => boolean;
  logout: () => void;
  updateClientStatus: (clientId: string, month: string, type: 'gstr1' | 'gstr3b', status: GSTStatus) => void;
  assignClient: (clientId: string, staffId: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  currentUser: null,
  clients: mockClients,
  users: mockUsers,
  login: (email: string) => {
    const user = get().users.find(u => u.email === email);
    if (user) {
      set({ currentUser: user });
      return true;
    }
    return false;
  },
  logout: () => set({ currentUser: null }),
  updateClientStatus: (clientId, month, type, status) => {
    set(state => ({
      clients: state.clients.map(client => {
        if (client.id !== clientId) return client;
        
        const returns = [...client.returns];
        const existingReturnIndex = returns.findIndex(r => r.month === month);
        
        if (existingReturnIndex >= 0) {
          returns[existingReturnIndex] = {
            ...returns[existingReturnIndex],
            [type]: status
          };
        } else {
          // Should not happen in this mock, but handle it
          const newReturn = { month, gstr1: 'Pending' as GSTStatus, gstr3b: 'Pending' as GSTStatus };
          newReturn[type] = status;
          returns.push(newReturn);
        }
        
        return { ...client, returns };
      })
    }));
  },
  assignClient: (clientId, staffId) => {
    set(state => ({
      clients: state.clients.map(client => 
        client.id === clientId ? { ...client, assignedToId: staffId } : client
      )
    }));
  }
}));
