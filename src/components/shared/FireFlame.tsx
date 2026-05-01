import React from 'react';
import LottieView from 'lottie-react-native';

const SOURCE = require('../../../assets/lottie/fire-streak.json');

interface Props {
  size?: number;
  opacity?: number;
}

export default function FireFlame({ size = 18, opacity = 1 }: Props) {
  return (
    <LottieView
      autoPlay
      loop
      source={SOURCE}
      style={{ width: size, height: size, opacity }}
    />
  );
}
