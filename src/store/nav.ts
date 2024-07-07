import { NAV } from '@/type/nav.type';
import { create } from 'zustand';

interface INavStore {
  activeKey: NAV;
  setActiveKey: (key: NAV) => void;
}

export const useNavStore = create<INavStore>((set) => ({
  activeKey: NAV.index,

  setActiveKey: (key: NAV) =>
    set((state) => {
      state.activeKey = key;
      return state;
    })
}));
