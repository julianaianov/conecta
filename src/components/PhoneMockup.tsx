import { MAP_ACTIVITIES, BANNER_PHOTOS } from "@/lib/banner-data";
import { ActivityPinIcon, MapPinMarker } from "./MapPinMarker";
import { AppImage } from "./AppImage";
import { DMLogo } from "./app/DMLogo";
import { Reveal } from "./Reveal";

export function PhoneMockup() {
  return (
    <Reveal className="relative mx-auto w-full max-w-sm lg:max-w-none">
      <div className="phone-glow absolute -inset-8 rounded-full bg-orange/20 blur-3xl" />

      <div className="relative mx-auto w-[280px] rotate-[-2deg] rounded-[2.5rem] border border-white/10 bg-navy-light/80 p-3 shadow-2xl backdrop-blur-sm transition-transform duration-500 hover:rotate-0 sm:w-[300px]">
        <div className="absolute left-1/2 top-3 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black/40" />

        <div className="relative overflow-hidden rounded-[2rem] bg-[#0d2840] pb-16">
          {/* Header app */}
          <div className="flex items-center justify-between bg-[#0D2D42] px-4 py-3 pt-7">
            <div className="flex items-center text-white">
              <DMLogo size={22} tone="light" />
            </div>
            <span className="relative text-white">
              <BellIcon />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
            </span>
          </div>

          <div className="p-3">
            <p className="mb-2 text-xs font-bold text-white">Mapa inteligente</p>
            <div className="relative h-32 overflow-hidden rounded-xl bg-[#EDE8DF]">
              <AppImage
                src={BANNER_PHOTOS.mapCoastal}
                alt="Mapa"
                fill
                className="object-cover opacity-95"
                sizes="260px"
              />
              {MAP_ACTIVITIES.map((a) => (
                <MapPinMarker
                  key={a.id}
                  category={a.category}
                  icon={a.pinIcon}
                  className="!scale-[0.65]"
                  style={{ left: `${a.x}%`, top: `${a.y}%` }}
                />
              ))}
            </div>

            <p className="mb-2 mt-3 text-xs font-bold text-white">Atividades próximas</p>
            <div className="space-y-2">
              {MAP_ACTIVITIES.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-2 rounded-xl bg-white p-2.5 shadow-sm"
                >
                  <ActivityPinIcon category={activity.category} icon={activity.pinIcon} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold text-navy">{activity.title}</p>
                    <p className="truncate text-[9px] text-steel">{activity.subtitle}</p>
                  </div>
                  <span
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[8px] font-bold"
                    style={{ backgroundColor: activity.badgeBg, color: activity.badgeText }}
                  >
                    {activity.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom nav */}
          <div className="absolute bottom-0 left-0 right-0 flex items-end justify-around border-t border-white/10 bg-[#0D2D42] px-2 py-2">
            <NavItem icon="home" label="Início" />
            <NavItem icon="search" label="Explorar" />
            <div className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-blue-light text-2xl font-light text-white shadow-lg">
              +
            </div>
            <NavItem icon="list" label="Atividades" active />
            <NavItem icon="user" label="Perfil" />
          </div>
        </div>
      </div>
    </Reveal>
  );
}

function NavItem({ icon, label, active = false }: { icon: string; label: string; active?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 ${active ? "text-blue-light" : "text-blue-muted"}`}>
      <span className="text-sm">{icon === "home" ? "⌂" : icon === "search" ? "⌕" : icon === "list" ? "☰" : "👤"}</span>
      <span className="text-[8px]">{label}</span>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}
