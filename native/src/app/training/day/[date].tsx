import { useLocalSearchParams } from 'expo-router';
import { TrainingRecordScreen } from '~/training/record-detail';
import { validRecordDate } from '@/lib/workout/record-model';

export default function TrainingDayScreen() {
  const { date, kind } = useLocalSearchParams<{ date: string; kind?: string }>();
  return <TrainingRecordScreen date={validRecordDate(date) ? date : 'invalid'} kind={kind === 'armcare' || kind === 'drill' ? kind : 'training'} />;
}
