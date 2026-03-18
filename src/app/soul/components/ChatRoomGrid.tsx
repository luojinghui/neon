'use client';

import type { ChatRoom } from './types';
import { ChatRoomCard } from './ChatRoomCard';

export function ChatRoomGrid({
  rooms,
  onRoomClick
}: {
  rooms: ChatRoom[];
  onRoomClick: (room: ChatRoom) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 md:gap-6">
      {rooms.map((room) => (
        <ChatRoomCard key={room.id} room={room} onClick={() => onRoomClick(room)} onPrimaryAction={() => onRoomClick(room)} />
      ))}
    </div>
  );
}

