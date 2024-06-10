import Link from "next/link";
import "@/styles/index.css";

export default function Home() {
  return (
    <div className="app-page">
      <div className="bg12 h-screen">
        <div className="nav ">
          <Link
            href="/chat"
            className="flex items-center justify-center cursor-pointer rounded-full text-black hover:text-white  w-16 h-16  bg-gradient-to-r from-pink-400 to-yellow-500 hover:from-blue-500  hover:to-green-500  hover:transition-all duration-700 ease-in-out"
          >
            Chat
          </Link>
        </div>
      </div>
    </div>
  );
}
