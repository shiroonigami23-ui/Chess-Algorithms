export interface LabMount {
  stage: HTMLElement;
  side: HTMLElement;
  dock: HTMLElement;
}

export interface Lab {
  id: string;
  title: string;
  tagline: string;
  blurb: string;
  accent: string;
  icon: string;
  /** 'page' labs get the whole content area; 'lab' labs get stage + side panel + timeline dock */
  layout?: 'lab' | 'page';
  mount(m: LabMount): () => void;
}
