import { Redirect, useLocalSearchParams } from 'expo-router';
import { WIKI_BASE } from '@/lib/wiki/categories';

export default function LegacyWikiScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  return <Redirect href={{ pathname: WIKI_BASE, params: typeof slug === 'string' ? { slug } : {} }} />;
}
