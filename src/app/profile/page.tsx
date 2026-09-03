'use client';

import { LoadingOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ensureCurrentProfile } from './client';

export default function MyProfileRedirectPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    ensureCurrentProfile()
      .then((profile) => {
        if (active) router.replace(`/profile/${encodeURIComponent(profile.userId)}`);
      })
      .catch((profileError) => {
        if (active) setError(profileError instanceof Error ? profileError.message : '个人资料加载失败');
      });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="flex h-screen items-center justify-center bg-background px-5 text-center">
      <div>
        {error ? (
          <>
            <div className="text-base font-medium text-foreground">暂时无法打开个人中心</div>
            <div className="mt-2 text-sm text-foreground-secondary">{error}</div>
            <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
              重试
            </button>
          </>
        ) : (
          <div className="inline-flex items-center gap-2 text-sm text-foreground-secondary">
            <LoadingOutlined className="text-primary" /> 正在认领你的星球身份…
          </div>
        )}
      </div>
    </main>
  );
}
