import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './widgets/widget-task-handler';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
registerRootComponent(App);

// Register the Android home-screen widget handler. Android invokes our
// task handler in a headless process when the widget is added, updated
// (every 6 hours per widgetprovider_verseofday.xml), resized, or clicked.
// The handler reads the cached verse from AsyncStorage and renders the
// VerseOfDayWidget JSX into RemoteViews. iOS has no equivalent — widget
// support there would require a separate WidgetKit extension target.
if (Platform.OS === 'android') {
  registerWidgetTaskHandler(widgetTaskHandler);
}
