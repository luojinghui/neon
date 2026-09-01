'use client';

import type { ChatRoom } from './types';
import { ChatRoomCard } from './ChatRoomCard';

type Props = {
  rooms: ChatRoom[];
  onRoomClick: (room: ChatRoom) => void;
  onRoomEdit: (room: ChatRoom) => void;
  onRoomDelete: (room: ChatRoom) => void;
};

export function ChatRoomGrid({ rooms, onRoomClick, onRoomEdit, onRoomDelete }: Props) {
  return (
    <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4 xl:grid-cols-6">
      {rooms.map((room) => (
        <ChatRoomCard
          key={room.id}
          room={room}
          onClick={() => onRoomClick(room)}
          onPrimaryAction={() => onRoomClick(room)}
          onEdit={() => onRoomEdit(room)}
          onDelete={() => onRoomDelete(room)}
        />
      ))}
    </div>
  );
}
