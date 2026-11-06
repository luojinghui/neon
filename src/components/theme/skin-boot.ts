export const SKIN_STORAGE_KEY = 'neon:skin';

/** Inline script text: applies the saved skin before first paint to avoid a colour flash. Server-safe module. */
export const skinBootScript = `try{var s=localStorage.getItem('${SKIN_STORAGE_KEY}');if(s)document.documentElement.dataset.skin=s}catch(e){}`;
