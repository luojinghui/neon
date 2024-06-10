"use client";

import Link from "next/link";
import { socket } from "@/socket.mjs";
import { useEffect, useState } from "react";

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (socket.connected) {
      onConnect();
    }

    function onConnect() {
      console.log("=======socket connect");
      socket.emit("message", "Hello");
      setIsConnected(true);
    }

    function onDisconnect() {
      console.log("=======socket disconnect");
      setIsConnected(false);
    }

    function onMessage(e: any) {
      console.log("========event: ", e);
    }

    function onMessage2(e: any) {
      console.log("========event2: ", e);
    }

    console.log("==========start");

    socket.on("message", onMessage);
    socket.on("message2", onMessage2);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  useEffect(() => {
    console.log("============111");
  });

  const onHandleWebSocket = () => {};

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4">
      <div>Chat Page</div>
      <button onClick={onHandleWebSocket}></button>
      <div>
        <p>WebSocket Status: {isConnected ? "connected" : "disconnected"}</p>
      </div>
      <Link href="/">Home</Link>
    </main>
  );
}
