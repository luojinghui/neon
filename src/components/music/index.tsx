import Image from 'next/image';

export default function Music() {
  return (
    <div className="fixed top-0 left-0">
      <div>music：{Math.ceil(Math.random() * 10000)}</div>
    </div>
  );
}
