import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Teacher Auth Store
interface Teacher {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  token: string | null;
  teacher: Teacher | null;
  isAuthenticated: boolean;
  setAuth: (token: string, teacher: Teacher) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      teacher: null,
      isAuthenticated: false,
      setAuth: (token, teacher) => set({ token, teacher, isAuthenticated: true }),
      logout: () => set({ token: null, teacher: null, isAuthenticated: false }),
    }),
    {
      name: 'hw-validator-auth',
    }
  )
);

// Student Session Store
export interface StudentParticipant {
  id: string;
  student_name: string;
  student_id?: string;
  status: string;
}

export interface TopicState {
  index: number;
  title: string;
  totalTime: number;
  timeLeft: number;
  status: string;
}

export interface InterviewState {
  current_topic_index: number;
  current_phase: string;
  topics_state: TopicState[];
}

interface StudentState {
  sessionToken: string | null;
  participant: StudentParticipant | null;
  interviewState: InterviewState | null;
  currentQuestion: string | null;
  isConnected: boolean;
  _hasHydrated: boolean;
  setSession: (token: string, participant: StudentParticipant) => void;
  setInterviewState: (state: InterviewState) => void;
  setCurrentQuestion: (question: string | null) => void;
  setConnected: (connected: boolean) => void;
  updateTimeLeft: (timeLeft: number) => void;
  clearSession: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useStudentStore = create<StudentState>()(
  persist(
    (set, get) => ({
      sessionToken: null,
      participant: null,
      interviewState: null,
      currentQuestion: null,
      isConnected: false,
      _hasHydrated: false,
      setSession: (sessionToken, participant) =>
        set({ sessionToken, participant, isConnected: true }),
      setInterviewState: (interviewState) => set({ interviewState }),
      setCurrentQuestion: (currentQuestion) => set({ currentQuestion }),
      setConnected: (isConnected) => set({ isConnected }),
      updateTimeLeft: (timeLeft) => {
        const state = get().interviewState;
        if (state && state.topics_state && state.topics_state[state.current_topic_index]) {
          const newTopicsState = [...state.topics_state];
          newTopicsState[state.current_topic_index] = {
            ...newTopicsState[state.current_topic_index],
            timeLeft,
          };
          set({
            interviewState: {
              ...state,
              topics_state: newTopicsState,
            },
          });
        }
      },
      clearSession: () =>
        set({
          sessionToken: null,
          participant: null,
          interviewState: null,
          currentQuestion: null,
          isConnected: false,
        }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'hw-validator-student',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// UI Store (for global UI state)
interface UIState {
  isLoading: boolean;
  error: string | null;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isLoading: false,
  error: null,
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));
