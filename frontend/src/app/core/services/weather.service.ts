import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface Forecast {
  temperature: number;
  rainChance: number;
  code: number;
  icon: string;
  description: { en: string; ar: string };
}

/**
 * Weather forecast for the kick-off hour (free Open-Meteo API, no key).
 * Defaults to Damanhur, Egypt. Only available up to 7 days ahead.
 */
@Injectable({ providedIn: 'root' })
export class WeatherService {
  private http = inject(HttpClient);
  private cache = new Map<string, Promise<Forecast | null>>();
  private readonly lat = 31.034;
  private readonly lon = 30.468;

  forecastAt(kickoff: string): Promise<Forecast | null> {
    const when = new Date(kickoff);
    const msAhead = when.getTime() - Date.now();
    if (msAhead < -3 * 3600e3 || msAhead > 7 * 24 * 3600e3) return Promise.resolve(null);

    const key = when.toISOString().slice(0, 13);
    if (!this.cache.has(key)) this.cache.set(key, this.load(when));
    return this.cache.get(key)!;
  }

  private async load(when: Date): Promise<Forecast | null> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.lat}&longitude=${this.lon}` +
        '&hourly=temperature_2m,precipitation_probability,weathercode&timezone=UTC&forecast_days=8';
      const res = await firstValueFrom(this.http.get<{ hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weathercode: number[] } }>(url));
      const target = when.toISOString().slice(0, 13);
      const i = res.hourly.time.findIndex(t => t.startsWith(target));
      if (i < 0) return null;
      const code = res.hourly.weathercode[i];
      return {
        temperature: Math.round(res.hourly.temperature_2m[i]),
        rainChance: res.hourly.precipitation_probability[i] ?? 0,
        code,
        ...describe(code)
      };
    } catch {
      return null;
    }
  }
}

const describe = (code: number): { icon: string; description: { en: string; ar: string } } => {
  if (code === 0) return { icon: '☀️', description: { en: 'Clear', ar: 'صافٍ' } };
  if (code <= 2) return { icon: '🌤️', description: { en: 'Partly cloudy', ar: 'غائم جزئياً' } };
  if (code === 3) return { icon: '☁️', description: { en: 'Cloudy', ar: 'غائم' } };
  if (code <= 48) return { icon: '🌫️', description: { en: 'Fog', ar: 'ضباب' } };
  if (code <= 67 || (code >= 80 && code <= 82)) return { icon: '🌧️', description: { en: 'Rain', ar: 'مطر' } };
  if (code <= 77) return { icon: '🌨️', description: { en: 'Snow', ar: 'ثلج' } };
  return { icon: '⛈️', description: { en: 'Storm', ar: 'عاصفة' } };
};
