'use client';

import { useState, useEffect, useCallback } from 'react';
import { difaMapApi, LocationFilterParams, CreateActivityPayload } from '../lib/api';
import { useAuth } from '../context/AuthContext';

/**
 * Hook reaktif untuk mengambil dan memfilter daftar Tempat & Trotoar
 */
export function useLocations(initialFilters: LocationFilterParams = {}) {
  const [filters, setFilters] = useState<LocationFilterParams>(initialFilters);
  const [locations, setLocations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLocations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await difaMapApi.getLocations(filters);
      setLocations(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data lokasi');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  return {
    locations,
    isLoading,
    error,
    filters,
    setFilters,
    refetch: fetchLocations,
  };
}

/**
 * Hook reaktif untuk mengambil Feed Aktivitas Komunitas
 */
export function useActivities(locationId?: string) {
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();

  const fetchActivities = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await difaMapApi.getActivities({ locationId, status: 'PUBLIC' });
      setActivities(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat aktivitas komunitas');
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const postActivity = async (payload: CreateActivityPayload) => {
    const res = await difaMapApi.createActivity(payload, session?.access_token);
    await fetchActivities();
    return res;
  };

  return {
    activities,
    isLoading,
    error,
    postActivity,
    refetch: fetchActivities,
  };
}

/**
 * Hook untuk berinteraksi dengan Chatbot Asisten Aksesibilitas DifaMap
 */
export function useAccessibilityChatbot() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; referencedLocations?: any[] }>>([
    {
      role: 'assistant',
      content: 'Halo! Saya DifaMap AI Assistant. Ada yang bisa saya bantu terkait rute, fasilitas ramah kursi roda, ubin pemandu (guiding block), atau waktu aman kunjungan di Kota Makassar dan Kabupaten Gowa?',
    },
  ]);
  const [isSending, setIsSending] = useState(false);

  const sendMessage = async (userText: string, userLocation?: { latitude: number; longitude: number }, selectedLocationId?: string) => {
    if (!userText.trim()) return;

    const newHistory = [...messages, { role: 'user' as const, content: userText }];
    setMessages(newHistory);
    setIsSending(true);

    try {
      const historyPayload = newHistory.map((m) => ({ role: m.role, content: m.content }));
      const response = await difaMapApi.chatWithAi(userText, userLocation, selectedLocationId, historyPayload);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.data?.reply || 'Maaf, saya tidak dapat merespon saat ini.',
          referencedLocations: response.data?.referencedLocations || [],
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Terjadi kendala saat menghubungi AI Assistant. Silakan coba sesaat lagi.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return {
    messages,
    isSending,
    sendMessage,
  };
}
