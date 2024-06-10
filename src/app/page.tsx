import Link from "next/link";
import "@/styles/index.css";
import { useState } from "react";

export default async function Home() {
  let resp = null;
  try {
    resp = await getData();
    console.log("=====data: ", resp);
  } catch (error) {
    console.log("=====fetch error: ", error);
  }

  return (
    <div className="app-page">
      <div className="bg12 h-screen">
        {/* <div>Home page</div>
        <div>user: {JSON.stringify(resp.data)}</div> */}
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

async function getData() {
  const res = await fetch("http://localhost:3000/api/user");

  if (!res.ok) {
    throw new Error("Failed to fetch data");
  }

  return res.json();
}
