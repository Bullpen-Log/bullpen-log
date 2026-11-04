import { useState } from 'react';
import { Modal } from 'react-native';
import type { LabView } from '@/lib/pitch-lab-meta';
import type { MyVideoItem } from '@/lib/my-videos';
import { VideoGallery } from '~/videos/gallery';
import { toast } from '~/shell/toast';

export function LabGalleryPicker({
  view,
  onPick,
  onClose,
}: {
  view: LabView;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<MyVideoItem | null>(null);
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <VideoGallery
        pick={{
          a: null,
          aPath: '',
          selected: chosen?.path ?? null,
          title: `분석에 쓸 ${view === 'side' ? '옆' : '뒤'} 영상`,
          onSelect: (v) => {
            if (v.sport !== 'pitch') toast('투구 영상을 선택해 주세요.', 'info');
            else setChosen(v);
          },
          onBack: onClose,
          foot: {
            text: '선택한 원본을 검사한 뒤 분석 영상으로 사용해요. 분석 요청은 최종 확인 후 진행돼요.',
            enabled: !!chosen,
          },
          next: {
            label: '이 원본 사용',
            onPress: () => {
              if (chosen) onPick(chosen.path);
            },
          },
        }}
      />
    </Modal>
  );
}
