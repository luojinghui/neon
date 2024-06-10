import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4">
      <div>Chat Page</div>
      <Link href="/">Home</Link>
    </main>
  );
}
