import type { Metadata } from 'next';
import { CameraOutlined, ClockCircleOutlined, StarFilled } from '@ant-design/icons';
import Image from 'next/image';
import { ImagePreview } from '@/components/image-viewer/ImagePreview';
import Link from 'next/link';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { doodleShareRepository } from '@/server/doodle/shareRepository';
import ShareActions from './ShareActions';
import '../../doodle.css';

export const dynamic = 'force-dynamic';

type SharePageProps = { params: Promise<{ shareId: string }> };

function getShare(id: string) {
  try {
    return doodleShareRepository.getShare(id);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { shareId } = await params;
  const share = getShare(shareId);
  const active = share?.state === 'active';
  return {
    title: active ? `${share.title} · 漫游相机` : '这张涂鸦已经离开星球',
    description: active ? `查收我的今日角色：${share.title}` : '这条漫游相机分享已经失效。',
    robots: { index: false, follow: false }
  };
}

export default async function DoodleSharePage({ params }: SharePageProps) {
  const { shareId } = await params;
  const share = getShare(shareId);
  const isGone = share && share.state !== 'active';

  if (!share || isGone) {
    return (
      <main className="app-page doodle-page flex items-center justify-center bg-[#fffaf0] px-5 py-12 text-[#201a17] dark:bg-[#17110f] dark:text-[#fff8ee]">
        <div className="w-full max-w-xl text-center">
          <div className="mx-auto flex h-28 w-28 rotate-6 items-center justify-center rounded-[36px] bg-[#ff7ba8]/60 text-5xl text-[#201a17]">
            <StarFilled />
          </div>
          <h1 className="mt-10 text-4xl font-black sm:text-5xl">这张涂鸦已经离开星球</h1>
          <p className="mt-4 font-semibold text-[#6f5f57] dark:text-[#cbb9ae]">{isGone ? '它可能已经到期，或被创建者主动销毁。' : '分享地址似乎不完整，检查一下链接再来看看吧。'}</p>
          <Link href="/doodle" className="doodle-primary-button mt-8"><CameraOutlined />生成我的今日角色</Link>
        </div>
      </main>
    );
  }

  const createdAt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(share.createdAt));
  const expiresAt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(share.expiresAt));
  const pageUrl = `/doodle/s/${share.id}`;

  return (
    <main className="app-page doodle-page bg-[#fffaf0] text-[#201a17] dark:bg-[#17110f] dark:text-[#fff8ee]">
      <TopBar middle="漫游相机" position="sticky" backHref="/doodle" backLabel="漫游相机" right={<ThemeToggle />} />

      <div className="app-content-width grid items-center gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-8">
        <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-[28px] border-[6px] border-[#201a17] bg-white shadow-[12px_12px_0_#201a17]">
          <ImagePreview images={[{ id: share.id, url: share.imageUrl, name: share.title }]} imageId={share.id} title="漫游相机" className="w-full">
            <Image src={share.imageUrl} alt={`漫画涂鸦：${share.title}`} width={1080} height={1440} unoptimized className="doodle-result-image block h-auto w-full" />
          </ImagePreview>
        </div>

        <section className="rounded-2xl border border-border/70 bg-surface/75 p-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#79e7c2]/30 px-4 py-2 text-sm font-bold text-foreground"><StarFilled />今日角色已送达</div>
          <p className="mt-7 text-sm font-black uppercase tracking-[0.2em] text-[#88746a] dark:text-[#cbb9ae]">TODAY&apos;S SOUL ROLE</p>
          <h1 className="mt-2 text-4xl font-black leading-tight sm:text-5xl">{share.title}</h1>
          <p className="mt-4 font-semibold text-[#6f5f57] dark:text-[#cbb9ae]">生成于 {createdAt}</p>
          <div className="mt-6 rounded-2xl bg-[#fff0b8] p-4 text-sm font-bold text-[#5d4c43]">
            <ClockCircleOutlined className="mr-2" />这条分享有效至 {expiresAt}，到期后图片会自动删除。
          </div>
          <ShareActions id={share.id} title={share.title} imageUrl={share.imageUrl} pageUrl={pageUrl} />
          <Link href="/doodle" className="doodle-secondary-button mt-8 w-full justify-center"><CameraOutlined />我也要拍一张</Link>
        </section>
      </div>
    </main>
  );
}
