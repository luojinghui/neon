import type { Metadata } from 'next';
import UIKitShowcase from './UIKitShowcase';
import { getThemeCatalog } from './theme-catalog';

export const metadata: Metadata = { title: 'UIKit · Soul', description: 'Soul 组件预览' };

export default function UIKitPage() {
  const { skins, typography, colors } = getThemeCatalog();
  return <UIKitShowcase catalog={{ skins, typography, colors }} />;
}
