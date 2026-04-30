'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { STORAGE_KEYS, storage } from '@/lib/storage';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/contexts/AuthContext';

interface WishlistContextType {
  wishlistItems: string[];
  addToWishlist: (productId: string) => void;
  removeFromWishlist: (productId: string) => void;
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  wishlistCount: number;
  clearWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const [wishlistItems, setWishlistItems] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    (async () => {
      const savedWishlist = storage.get<string[]>(STORAGE_KEYS.WISHLIST) ?? [];

      if (!user) {
        if (!cancelled) {
          setWishlistItems(savedWishlist);
          setIsInitialized(true);
        }
        return;
      }

      if (savedWishlist.length > 0) {
        const rows = savedWishlist.map((productId) => ({
          user_id: user.id,
          product_id: productId,
          priority: 3,
        }));

        await supabase
          .from('wishlist_items')
          .upsert(rows, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
      }

      const { data } = await supabase
        .from('wishlist_items')
        .select('product_id')
        .eq('user_id', user.id);

      if (!cancelled) {
        setWishlistItems((data ?? []).map((row: any) => row.product_id));
        setIsInitialized(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  useEffect(() => {
    if (isInitialized) {
      if (user) {
        storage.remove(STORAGE_KEYS.WISHLIST);
      } else {
        storage.set(STORAGE_KEYS.WISHLIST, wishlistItems);
      }
    }
  }, [wishlistItems, isInitialized, user]);

  const addToWishlist = (productId: string) => {
    let added = false;
    setWishlistItems(prev => {
      if (prev.includes(productId)) {
        return prev;
      }
      added = true;
      return [...prev, productId];
    });

    if (user && added) {
      void (async () => {
        const { error } = await supabase
          .from('wishlist_items')
          .upsert(
            { user_id: user.id, product_id: productId, priority: 3 },
            { onConflict: 'user_id,product_id', ignoreDuplicates: true }
          );

        if (error) {
          setWishlistItems(prev => prev.filter(id => id !== productId));
          console.error('Failed to add wishlist item:', error);
        }
      })();
    }
  };

  const removeFromWishlist = (productId: string) => {
    const removed = wishlistItems.includes(productId);
    setWishlistItems(prev => prev.filter(id => id !== productId));

    if (user && removed) {
      void (async () => {
        const { error } = await supabase
          .from('wishlist_items')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId);

        if (error) {
          setWishlistItems(prev => (prev.includes(productId) ? prev : [...prev, productId]));
          console.error('Failed to remove wishlist item:', error);
        }
      })();
    }
  };

  const toggleWishlist = (productId: string) => {
    const exists = wishlistItems.includes(productId);
    if (exists) {
      removeFromWishlist(productId);
      return;
    }
    addToWishlist(productId);
  };

  const isInWishlist = (productId: string): boolean => {
    return wishlistItems.includes(productId);
  };

  const clearWishlist = () => {
    setWishlistItems([]);

    if (user) {
      void (async () => {
        const { error } = await supabase
          .from('wishlist_items')
          .delete()
          .eq('user_id', user.id);

        if (error) {
          console.error('Failed to clear wishlist:', error);
        }
      })();
    }
  };

  const value: WishlistContextType = {
    wishlistItems,
    addToWishlist,
    removeFromWishlist,
    toggleWishlist,
    isInWishlist,
    wishlistCount: wishlistItems.length,
    clearWishlist,
  };

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (context === undefined) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
}
