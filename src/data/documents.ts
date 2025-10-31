import type { Document } from '@/types'
import { pdfService } from '@/services/pdfService'

// Real PDF documents will be fetched dynamically
let availableDocuments: Document[] = [];

// Function to load documents dynamically
async function loadDocuments(): Promise<void> {
  try {
    availableDocuments = await pdfService.fetchDocuments();
    console.log('Documents loaded:', availableDocuments.length);
  } catch (error) {
    console.error('Failed to load documents:', error);
    // Fallback to an empty list or handle error as needed
    availableDocuments = [];
  }
}

// Load documents on module initialization
loadDocuments();

export { availableDocuments }

// Document type configurations
export const documentTypeConfig = {
  TDS: {
    color: 'blue',
    icon: '📋',
    priority: 1,
  },
  ESR: {
    color: 'green',
    icon: '✅',
    priority: 2,
  },
  MSDS: {
    color: 'red',
    icon: '⚠️',
    priority: 8,
  },
  LEED: {
    color: 'emerald',
    icon: '🌿',
    priority: 6,
  },
  Installation: {
    color: 'orange',
    icon: '🔧',
    priority: 3,
  },
  warranty: {
    color: 'purple',
    icon: '🛡️',
    priority: 4,
  },
  Acoustic: {
    color: 'indigo',
    icon: '🔊',
    priority: 7,
  },
  PartSpec: {
    color: 'gray',
    icon: '📐',
    priority: 5,
  },
};
