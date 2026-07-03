import Link from "next/link";
import { APP_URL } from "@/lib/constants";
import { Reveal } from "./Reveal";

export function CTABanner() {
  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <Reveal>
          <div
            style={{ background: "var(--th-card-alt)", borderColor: "var(--th-border)" }}
            className="relative overflow-hidden rounded-3xl border"
          >
            {/* Decorative blobs */}
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-orange/10 blur-3xl" />
              <div className="absolute -right-20 -bottom-20 h-80 w-80 rounded-full bg-blue-light/10 blur-3xl" />
            </div>

            <div className="relative px-8 py-20 lg:py-24">
              <div className="mx-auto max-w-2xl text-center">
                {/* Badge */}
                <div className="mb-6 flex justify-center">
                  <span className="inline-flex items-center gap-2 rounded-full border border-orange/30 bg-orange/10 px-4 py-1.5 text-sm text-orange">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange" />
                    Plataforma aberta para todos os bairros
                  </span>
                </div>

                <h2 className="text-3xl font-extrabold sm:text-4xl lg:text-5xl" style={{ color: "var(--th-text)" }}>
                  Pronto para fazer
                  <br />
                  <span className="gradient-text">parte da rede?</span>
                </h2>

                <p className="mt-5 text-lg" style={{ color: "var(--th-muted)" }}>
                  Gratuito · Sem anúncios · Web, Android e iOS
                </p>

                <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                  <Link
                    href={`${APP_URL}/register`}
                    className="w-full rounded-xl bg-orange px-8 py-4 text-center text-base font-bold text-white shadow-lg shadow-orange/20 transition-all hover:bg-orange-light hover:-translate-y-0.5 sm:w-auto"
                  >
                    Criar conta gratuita
                  </Link>
                  <Link
                    href={`${APP_URL}/login`}
                    style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}
                    className="w-full rounded-xl border px-8 py-4 text-center text-base font-semibold transition-all hover:border-orange/40 hover:bg-orange/5 sm:w-auto"
                  >
                    Já tenho conta
                  </Link>
                </div>

                <div className="mt-8 flex justify-center gap-6 text-sm" style={{ color: "var(--th-muted)" }}>
                  <span>🌐 Web</span>
                  <span>📱 Android</span>
                  <span>🍎 iOS</span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
