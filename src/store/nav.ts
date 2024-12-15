import { MENU } from './nav.type';
import { create } from 'zustand';

interface INavStore {
  activeKey: MENU;
  setActiveKey: (key: MENU) => void;
}

export const useNavStore = create<INavStore>((set) => ({
  activeKey: MENU.home,

  setActiveKey: (key: MENU) =>
    set((state) => {
      state.activeKey = key;
      return state;
    })
}));
