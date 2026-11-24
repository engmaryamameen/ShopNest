'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './auth.module.css';

const slides = [
  { name: 'Electronics', image: 'electronics.png', title: ['Many stores.', 'One destination.'], description: 'Discover tech and everyday essentials, all in one place.' },
  { name: 'Fashion', image: 'fashion-warm.png', title: ['Your style.', 'Your next favorite.'], description: 'Find clothing and accessories that feel like you.' },
  { name: 'Beauty', image: 'beauty-rose.png', title: ['A little care.', 'All yours.'], description: 'Discover beauty and fragrance for your everyday rituals.' },
  { name: 'Travel', image: 'travel-slate.png', title: ['Pack for', 'what’s next.'], description: 'From daily commutes to new destinations, find your essentials.' },
  { name: 'Fitness', image: 'fitness-lavender.png', title: ['Find your rhythm.', 'Make it yours.'], description: 'Explore essentials for movement, workouts and time for yourself.' },
];

export function AuthShowcase() {
  const [active, setActive] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [loaded, setLoaded] = useState<string[]>([]);
  const showcaseRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ready = Array.from(showcaseRef.current?.querySelectorAll('img') ?? [])
      .filter((image) => image.complete && image.naturalWidth > 0)
      .map((image) => image.dataset.scene)
      .filter((name): name is string => Boolean(name));
    setLoaded((current) => Array.from(new Set([...current, ...ready])));
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (interacting || reducedMotion || loaded.length !== slides.length) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 6000);
    return () => window.clearInterval(timer);
  }, [interacting, reducedMotion, loaded.length]);

  return <aside ref={showcaseRef} className={styles.collectionShowcase} aria-label="ShopNest collections" onFocus={() => setInteracting(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }}>
    {slides.map((slide, index) => <div key={slide.name} className={`${styles.collectionSlide} ${index === active ? styles.collectionActive : ''}`} aria-hidden={index !== active}>
      {/* Preload every scene so a selection never reveals an empty background. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/images/auth/collections/${slide.image}`} data-scene={slide.image} alt="" onLoad={() => setLoaded((current) => current.includes(slide.image) ? current : [...current, slide.image])} />
      <div className={styles.collectionCopy}><span>{slide.name}</span><h2>{slide.title[0]}<br />{slide.title[1]}</h2><p>{slide.description}</p></div>
    </div>)}
    <div className={styles.collectionControls} aria-label="Choose a collection">
      {slides.map((slide, index) => <button type="button" key={slide.name} aria-label={`Show ${slide.name}`} aria-pressed={index === active} onClick={() => setActive(index)} />)}
    </div>
  </aside>;
}
