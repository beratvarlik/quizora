// Sayfalar API'yi YALNIZCA buradan alır. Gerçek api.ts varsa ve Supabase
// ortam değişkenleri tanımlıysa onu, yoksa (ya da VITE_USE_MOCK=true ise) sahtesini kullanır.
import type { QuizoraApi } from '../types'
import { api as sahte } from './api.mock'

const real = import.meta.glob<{ api: QuizoraApi }>('./api.ts', { eager: true })
const gercek = real['./api.ts']?.api
const ortamVar = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

export const isMock: boolean = import.meta.env.VITE_USE_MOCK === 'true' || !gercek || !ortamVar
export const api: QuizoraApi = isMock || !gercek ? sahte : gercek
