import { openDialog } from './ui.ts';

const menu = document.getElementById('menu-drawer') as HTMLDialogElement | null;
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-open-menu]');
  if (btn && menu) openDialog(menu, btn);
});
// Following an in-page link (e.g. /#custom-prints) from the menu should close it.
menu?.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a');
  if (a && a.getAttribute('href')?.includes('#')) menu.close();
});
