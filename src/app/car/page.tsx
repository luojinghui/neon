'use client';

import Link from 'next/link';
import { ArrowLeftOutlined } from '@ant-design/icons';
import '@/styles/index.css';

export default function Home() {
  return (
    <div className="h-screen bg12">
      <div className="p-4 text-white">
        <h1 className="">比亚迪秦Plus软件资源:</h1>
        <br />
        <a href="https://luojh.com/upload/kw_6.3.1.20.apk" className="href hover:text-blue-500">
          酷我6.3版本
        </a>
        <br />
        <br />
        <a href="https://luojh.com/upload/BYD_shafa.apk" className="href hover:text-blue-500">
          沙发管家
        </a>
        <br />
        <br />
        <a href="https://luojh.com/upload/Auto_7.1.0.600067.apk" className="href hover:text-blue-500">
          高德7.1
        </a>
      </div>
    </div>
  );
}
