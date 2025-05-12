'use client';

export default function Home() {
  return (
    <div className="h-screen bg12 overflow-hidden">
      <div className="share bg-white/30 rounded-[4px] p-8">
        <div className="text-white">
          <h1 className="cursor-default text-3xl mb-10">比亚迪车机软件资源</h1>

          <div className="mb-5 text-stone-100">
            <a href="https://luojh.com/upload/kw_6.3.1.20.apk" className="hover:text-stone-300">
              酷我6.3.1版本
            </a>
          </div>

          <div className="mb-5 text-stone-100">
            <a href="https://luojh.com/upload/BYD_shafa.apk" className=" hover:text-stone-300">
              沙发管家
            </a>
          </div>

          <div className="text-stone-100">
            <a href="https://luojh.com/upload/Auto_7.1.0.600067.apk" className=" hover:text-stone-300">
              高德7.1
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
