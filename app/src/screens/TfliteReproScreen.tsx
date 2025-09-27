import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Button, Alert } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';
import { toByteArray as base64ToBytes } from 'base64-js';
import { loadTensorflowModel } from 'react-native-fast-tflite';
import * as Clipboard from 'expo-clipboard';
import { Asset } from 'expo-asset';

// Place a test nutrition label image at assets/test/sample-label.jpg
const MODEL = require('../../assets/models/nutri-detector-int8.tflite');
const SAMPLE = require('../../assets/test/sample-label.jpg');

export default function TfliteReproScreen() {
  const [log, setLog] = useState<string>('');
  const copyToClipboard = async () => {
    await Clipboard.setStringAsync(log);
    Alert.alert('Copied', 'Log copied to clipboard.');
  };

  useEffect(() => {
    const run = async () => {
      const lines: string[] = [];
      const push = (msg: string) => {
        lines.push(msg);
        setLog(lines.join('\n'));
      };
      try {
        push('Loading model...');
        const model = await loadTensorflowModel(MODEL);
        push(`Model loaded. inputs=${JSON.stringify(model.inputs)} outputs=${JSON.stringify(model.outputs)}`);

        push('Loading sample image...');
        const asset = Asset.fromModule(SAMPLE);
        await asset.downloadAsync();
        const sampleUri = asset.localUri ?? asset.uri;
        if (!sampleUri) {
          push('Unable to resolve sample image URI.');
          return;
        }
        const manipulated = await ImageManipulator.manipulateAsync(
          sampleUri,
          [{ resize: { width: 640, height: 640 } }],
          { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (!manipulated.base64) {
          push('No base64 on manipulated image.');
          return;
        }
        const jpegBytes = base64ToBytes(manipulated.base64);
        const decoded = decodeJpeg(jpegBytes, { useTArray: true });
        if (!decoded || !decoded.data) {
          push('JPEG decode failed.');
          return;
        }
        const rgba = decoded.data;
        const rgb = new Float32Array(640 * 640 * 3);
        for (let i = 0, j = 0; i < rgba.length; i += 4) {
          rgb[j++] = rgba[i] / 255;
          rgb[j++] = rgba[i + 1] / 255;
          rgb[j++] = rgba[i + 2] / 255;
        }

        push('Running inference (sync)...');
        const outputSync = model.runSync([rgb]);
        push(`runSync returned ${outputSync.length} tensors`);
        outputSync.forEach((tensor: any, idx: number) => {
          const arr = ArrayBuffer.isView(tensor) ? tensor : (tensor?.buffer ? new Float32Array(tensor.buffer) : tensor);
          push(`sync tensor[${idx}] type=${Object.prototype.toString.call(arr)} len=${arr?.length ?? 'n/a'}`);
        });

        push('Running inference (async)...');
        const outputAsync = await model.run([rgb]);
        push(`run returned ${outputAsync.length} tensors`);
        outputAsync.forEach((tensor: any, idx: number) => {
          const arr = ArrayBuffer.isView(tensor) ? tensor : (tensor?.buffer ? new Float32Array(tensor.buffer) : tensor);
          push(`async tensor[${idx}] type=${Object.prototype.toString.call(arr)} len=${arr?.length ?? 'n/a'}`);
        });
      } catch (e: any) {
        push(`Error: ${e?.message ?? String(e)}`);
        if (e?.stack) push(e.stack);
      }
    };
    run();
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: 'Courier', fontWeight: '600' }}>fast-tflite repro log</Text>
        <Button title="Copy" onPress={copyToClipboard} disabled={!log} />
      </View>
      <View style={{ backgroundColor: '#111', borderRadius: 8, padding: 12 }}>
        <Text style={{ color: '#0f0', fontFamily: 'Courier' }}>{log || 'Running...'}</Text>
      </View>
    </ScrollView>
  );
}
