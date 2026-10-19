import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';

import DisclosureMatrix from './components/DisclosureMatrix.vue';
import HeroShot from './components/HeroShot.vue';
import MovedPage from './components/MovedPage.vue';
import NextCards from './components/NextCards.vue';
import NetworkDiagram from './components/NetworkDiagram.vue';
import ScreenTour from './components/ScreenTour.vue';
import SetupSteps from './components/SetupSteps.vue';
import Shot from './components/Shot.vue';

import './style.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Shot', Shot);
    app.component('ScreenTour', ScreenTour);
    app.component('NetworkDiagram', NetworkDiagram);
    app.component('SetupSteps', SetupSteps);
    app.component('DisclosureMatrix', DisclosureMatrix);
    app.component('HeroShot', HeroShot);
    app.component('NextCards', NextCards);
    app.component('MovedPage', MovedPage);
  },
} satisfies Theme;
