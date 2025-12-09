import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Button, Alert, TextInput, Modal, TouchableOpacity, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { runMockOcrAsync } from '../utils/mockOcr';
import { runOcrAndParse } from '../utils/ocr';
import { useApp } from '../context/AppContext';
import { CameraView, useCameraPermissions } from 'expo-camera';

export default function ScanScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const compareSourceId = route.params?.compareSourceId as string | undefined;
  const compareSourceCreatedAt = route.params?.compareSourceCreatedAt as string | undefined;
  const { consumeToken, subscriptionStatus, tokens } = useApp();
  const [price, setPrice] = useState('');
  const [showPrice, setShowPrice] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{width:number,height:number}|null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [parsedCalories, setParsedCalories] = useState<number | undefined>();
  const [parsedProtein, setParsedProtein] = useState<number | undefined>();
  const [parsedRawText, setParsedRawText] = useState<string | undefined>();
  const [parsedServings, setParsedServings] = useState<number | undefined>();

  const onCapture = useCallback(async () => {
    if (!permission?.granted) {
      if (permission && permission.canAskAgain === false) {
        Alert.alert(
          'Camera access disabled',
          'Enable camera access from iOS Settings to capture new scans.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      const res = await requestPermission();
      if (!res.granted) return;
    }
    const allowed = subscriptionStatus === 'active' ? true : consumeToken();
    if (!allowed) {
      Alert.alert('No scan tokens', 'Visit the Account tab to claim free tokens or subscribe for unlimited scans.');
      return;
    }
    try {
      // Take picture
      // @ts-ignore - method available at runtime
      const photo = await cameraRef.current?.takePictureAsync?.({ quality: 0.8, skipProcessing: true });
      const uri: string = photo?.uri ?? 'mock://image';
      setImageUri(uri);
      if (photo?.width && photo?.height) setImageDims({ width: photo.width, height: photo.height });
      // Defer OCR to PickCells to ensure stable results via taps
      setParsedCalories(undefined);
      setParsedProtein(undefined);
      setParsedServings(undefined);
      setParsedRawText(undefined);
      setShowPrice(true);
    } catch (e) {
      Alert.alert('Capture failed', 'Please try again.');
    }
  }, [permission?.granted, requestPermission, consumeToken, subscriptionStatus]);

  const onUpload = useCallback(async () => {
    const allowed = subscriptionStatus === 'active' ? true : consumeToken();
    if (!allowed) {
      Alert.alert('No scan tokens', 'Visit the Account tab to claim free tokens or subscribe for unlimited scans.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (res.canceled) return;
    const asset = res.assets[0];
    setImageUri(asset.uri);
    if (asset.width && asset.height) setImageDims({ width: asset.width, height: asset.height });
    setParsedCalories(undefined);
    setParsedProtein(undefined);
    setParsedServings(undefined);
    setParsedRawText(undefined);
    setShowPrice(true);
  }, [consumeToken, subscriptionStatus]);

  const onConfirmPrice = useCallback(() => {
    const p = Number(price);
    if (!isFinite(p) || p <= 0) {
      Alert.alert('Invalid price', 'Enter a valid price.');
      return;
    }
    // Go to detector preview; it will visualize boxes and continue to results
    navigation.navigate('DetectPreview', {
      imageUri,
      price: p,
      originalWidth: imageDims?.width ?? null,
      originalHeight: imageDims?.height ?? null,
      scanId: compareSourceId,
      createdAt: compareSourceCreatedAt,
    });
    setShowPrice(false);
    setPrice('');
  }, [price, navigation, imageUri, parsedCalories, parsedProtein, parsedServings, parsedRawText]);

  return (
    <View style={{ flex: 1 }}>
      {/* Top badges */}
      <View style={{ padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: '#fff' }}>🔑 {tokens} tokens</Text>
        {subscriptionStatus === 'active' ? <Text style={{ color: '#fff' }}>⭐ Unlimited</Text> : null}
      </View>

      {/* Camera area */}
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {permission?.granted ? (
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 16 }}>
              Cutly uses your camera to capture nutrition labels so we can calculate value metrics. You can also choose a photo from your gallery.
            </Text>
            {permission?.canAskAgain === false ? (
              <Button title="Open Settings" onPress={() => Linking.openSettings()} />
            ) : (
              <Button title="Continue" onPress={() => requestPermission()} />
            )}
            <View style={{ height: 12 }} />
            <Button title="Use Gallery Instead" onPress={onUpload} />
          </View>
        )}
      </View>

      {/* Capture button */}
      <View style={{ padding: 16, alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={onCapture} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 62, height: 62, borderRadius: 31, borderColor: '#ccc', borderWidth: 2 }} />
        </TouchableOpacity>
        <Button title="Upload from Gallery" onPress={onUpload} />
      </View>

      <Modal visible={showPrice} transparent animationType="slide">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ padding: 16, backgroundColor: 'white', borderRadius: 8, width: '80%' }}>
            <Text style={{ marginBottom: 8 }}>Enter Price ($)</Text>
            <TextInput
              keyboardType="decimal-pad"
              placeholder="0.00"
              value={price}
              onChangeText={setPrice}
              style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, marginBottom: 12 }}
            />
            <Button title="Continue" onPress={onConfirmPrice} />
            <View style={{ height: 8 }} />
            <Button title="Cancel" onPress={() => setShowPrice(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}


