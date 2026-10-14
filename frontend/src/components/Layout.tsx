import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Hero } from './Hero';
import { MapView } from './MapView';

export function Layout() {
  const [isMapOpen, setIsMapOpen] = useState(false);

  return (
    <div className="flex h-full min-h-screen w-full">
      <Sidebar onOpenMap={() => setIsMapOpen(true)} />
      <Hero />
      {isMapOpen && <MapView onClose={() => setIsMapOpen(false)} />}
    </div>
  );
}
