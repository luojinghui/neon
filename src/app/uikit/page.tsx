import type { Metadata } from 'next';
import UIKitShowcase from './UIKitShowcase';
import { getThemeCatalog } from './theme-catalog';

export const metadata: Metadata = { title: 'UIKit · Soul', description: 'Soul 基础组件与主题颜色' };

export default function UIKitPage() {
  return <UIKitShowcase catalog={getThemeCatalog()} />;
}
