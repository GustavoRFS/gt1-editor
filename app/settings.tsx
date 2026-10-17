import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Check, ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '../src/components/AppText';
import { getSavedAppLanguage, setAppLanguage } from '../src/i18n';
import type { AppLanguage } from '../src/i18n';
import { colors } from '../src/theme';

const languageOptions: Array<{ value: AppLanguage; labelKey: string }> = [
  { value: 'device', labelKey: 'deviceLanguage' },
  { value: 'pt', labelKey: 'portuguese' },
  { value: 'en', labelKey: 'english' },
  { value: 'es', labelKey: 'spanish' },
];

export default function SettingsScreen() {
  const { t } = useTranslation(undefined, { useSuspense: false });
  const [language, setLanguage] = useState<AppLanguage>('device');

  useEffect(() => { void getSavedAppLanguage().then(setLanguage); }, []);

  const chooseLanguage = async (next: AppLanguage) => {
    setLanguage(next);
    await setAppLanguage(next);
  };

  return (
    <ScrollView contentContainerClassName="grow bg-canvas px-2 py-3 sm:px-5 sm:py-6">
      <View className="mx-auto w-full max-w-[840px] gap-5">
        <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => router.back()} className="min-h-[42px] flex-row items-center self-start gap-1">
          <ChevronLeft size={20} color={colors.text} />
          <AppText variant="label">{t('back')}</AppText>
        </Pressable>
        <View className="gap-1">
          <AppText variant="caption" className="text-accent">{t('appSettings')}</AppText>
          <AppText variant="title">{t('settings')}</AppText>
        </View>
        <View className="gap-2 rounded-lg border border-line bg-surface p-3 sm:p-5">
          <View className="mb-2 gap-1">
            <AppText variant="headline">{t('language')}</AppText>
            <AppText variant="subhead">{t('languageDescription')}</AppText>
          </View>
          {languageOptions.map((option) => {
            const selected = language === option.value;
            return (
              <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => { void chooseLanguage(option.value); }} className={`min-h-12 flex-row items-center justify-between rounded-md border border-transparent px-3 py-2 ${selected ? 'border-line bg-surface-selected' : ''}`}>
                <AppText variant="body" className={selected ? 'font-bold text-accent' : ''}>{t(option.labelKey)}</AppText>
                {selected ? <Check size={18} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}
