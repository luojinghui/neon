'use client';

import { Button } from '@/components/ui/button';
import { LoadingOutlined } from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ensureCurrentProfile } from './client';
import { createProfileHref, sanitizeProfileReturnTo } from './navigation';

export default function MyProfileRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const returnTo = sanitizeProfileReturnTo(searchParams.get('from'));
  const section = searchParams.get('section') === 'messages' ? '&section=messages' : '';

  useEffect(() => {
    let active = true;
    ensureCurrentProfile()
      .then((profile) => {
        if (active) router.replace(`${createProfileHref(profile.userId, { returnTo })}${section}`);
      })
      .catch((profileError) => {
        if (active) setError(profileError instanceof Error ? profileError.message : '个人资料加载失败');
      });
    return () => {
      active = false;
    };
  }, [returnTo, router, section]);

  return (
    <main className="app-screen flex items-center justify-center bg-background px-5 text-center">
      <div>
        {error ? (
          <>
            <div className="text-base font-medium text-foreground">暂时无法打开个人中心</div>
            <div className="mt-2 text-sm text-foreground-secondary">{error}</div>
            <Button variant="primary" type="button" onClick={() => window.location.reload()} className="mt-5">
              重试
            </Button>
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
