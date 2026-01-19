/**
 * Pipeline Editor - Visual node-based pipeline configuration using React Flow
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search, Database, Target, FileText, Play } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

// Storage key for pipeline configuration
const PIPELINE_CONFIG_KEY = 'jobops.pipeline.config';

// Pipeline configuration state
export interface PipelineEditorConfig {
  enableCrawling: boolean;
  enableImporting: boolean;
  enableScoring: boolean;
  enableAutoTailoring: boolean;
}

// Default configuration
const DEFAULT_CONFIG: PipelineEditorConfig = {
  enableCrawling: true,
  enableImporting: true,
  enableScoring: true,
  enableAutoTailoring: true,
};

// Node types for our pipeline
type PipelineNodeType = 'trigger' | 'crawler' | 'importer' | 'scorer' | 'generator';

interface PipelineNodeData {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  toggleable: boolean;
  enabled?: boolean;
  configKey?: keyof PipelineEditorConfig;
  onToggle?: (enabled: boolean) => void;
}

// Custom node component
const PipelineNode: React.FC<NodeProps<PipelineNodeData>> = ({ data, selected }) => {
  const Icon = data.icon;
  const isEnabled = data.enabled !== false;
  const showToggle = data.toggleable;

  return (
    <Card
      className={cn(
        'px-4 py-3 min-w-[200px] transition-all duration-200',
        selected && 'ring-2 ring-primary',
        !isEnabled && 'opacity-50 grayscale'
      )}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3" />
      
      <div className="flex items-start gap-3">
        <div className={cn(
          'rounded-lg p-2 shrink-0',
          isEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}>
          <Icon className="h-5 w-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="font-semibold text-sm truncate">{data.label}</div>
            {showToggle && data.onToggle && (
              <Switch
                checked={isEnabled}
                onCheckedChange={data.onToggle}
                className="shrink-0"
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-tight">
            {data.description}
          </p>
        </div>
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </Card>
  );
};

const nodeTypes = {
  pipelineNode: PipelineNode,
};

interface PipelineEditorProps {
  onChange?: (config: PipelineEditorConfig) => void;
  className?: string;
}

export const PipelineEditor: React.FC<PipelineEditorProps> = ({ onChange, className }) => {
  // Load initial config from localStorage
  const [config, setConfig] = useState<PipelineEditorConfig>(() => {
    try {
      const saved = localStorage.getItem(PIPELINE_CONFIG_KEY);
      if (saved) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch {
      // Ignore errors
    }
    return DEFAULT_CONFIG;
  });

  // Save config to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(PIPELINE_CONFIG_KEY, JSON.stringify(config));
      onChange?.(config);
    } catch {
      // Ignore errors
    }
  }, [config, onChange]);

  // Handle toggle changes
  const handleToggle = useCallback((key: keyof PipelineEditorConfig) => {
    return (enabled: boolean) => {
      setConfig(prev => ({ ...prev, [key]: enabled }));
    };
  }, []);

  // Define nodes
  const initialNodes: Node<PipelineNodeData>[] = [
    {
      id: 'trigger',
      type: 'pipelineNode',
      position: { x: 250, y: 0 },
      data: {
        label: 'Pipeline Trigger',
        description: 'Start the job discovery and processing pipeline',
        icon: Play,
        toggleable: false,
      },
    },
    {
      id: 'crawler',
      type: 'pipelineNode',
      position: { x: 250, y: 120 },
      data: {
        label: 'Job Crawler',
        description: 'Discover new jobs from multiple sources',
        icon: Search,
        toggleable: true,
        enabled: config.enableCrawling,
        configKey: 'enableCrawling',
        onToggle: handleToggle('enableCrawling'),
      },
    },
    {
      id: 'importer',
      type: 'pipelineNode',
      position: { x: 250, y: 240 },
      data: {
        label: 'Job Importer',
        description: 'Import discovered jobs to database',
        icon: Database,
        toggleable: true,
        enabled: config.enableImporting,
        configKey: 'enableImporting',
        onToggle: handleToggle('enableImporting'),
      },
    },
    {
      id: 'scorer',
      type: 'pipelineNode',
      position: { x: 250, y: 360 },
      data: {
        label: 'AI Scorer',
        description: 'Score jobs based on suitability',
        icon: Target,
        toggleable: true,
        enabled: config.enableScoring,
        configKey: 'enableScoring',
        onToggle: handleToggle('enableScoring'),
      },
    },
    {
      id: 'generator',
      type: 'pipelineNode',
      position: { x: 250, y: 480 },
      data: {
        label: 'Resume Generator',
        description: 'Generate tailored resumes for top jobs',
        icon: FileText,
        toggleable: true,
        enabled: config.enableAutoTailoring,
        configKey: 'enableAutoTailoring',
        onToggle: handleToggle('enableAutoTailoring'),
      },
    },
  ];

  // Define edges
  const initialEdges: Edge[] = [
    {
      id: 'trigger-crawler',
      source: 'trigger',
      target: 'crawler',
      animated: config.enableCrawling,
      style: {
        stroke: config.enableCrawling ? undefined : '#6b7280',
        strokeWidth: 2,
      },
    },
    {
      id: 'crawler-importer',
      source: 'crawler',
      target: 'importer',
      animated: config.enableCrawling && config.enableImporting,
      style: {
        stroke: config.enableCrawling && config.enableImporting ? undefined : '#6b7280',
        strokeWidth: 2,
      },
    },
    {
      id: 'importer-scorer',
      source: 'importer',
      target: 'scorer',
      animated: config.enableImporting && config.enableScoring,
      style: {
        stroke: config.enableImporting && config.enableScoring ? undefined : '#6b7280',
        strokeWidth: 2,
      },
    },
    {
      id: 'scorer-generator',
      source: 'scorer',
      target: 'generator',
      animated: config.enableScoring && config.enableAutoTailoring,
      style: {
        stroke: config.enableScoring && config.enableAutoTailoring ? undefined : '#6b7280',
        strokeWidth: 2,
      },
    },
  ];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when config changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const data = node.data as PipelineNodeData;
        if (data.configKey) {
          return {
            ...node,
            data: {
              ...data,
              enabled: config[data.configKey],
              onToggle: handleToggle(data.configKey),
            },
          };
        }
        return node;
      })
    );

    // Update edges
    setEdges([
      {
        id: 'trigger-crawler',
        source: 'trigger',
        target: 'crawler',
        animated: config.enableCrawling,
        style: {
          stroke: config.enableCrawling ? undefined : '#6b7280',
          strokeWidth: 2,
        },
      },
      {
        id: 'crawler-importer',
        source: 'crawler',
        target: 'importer',
        animated: config.enableCrawling && config.enableImporting,
        style: {
          stroke: config.enableCrawling && config.enableImporting ? undefined : '#6b7280',
          strokeWidth: 2,
        },
      },
      {
        id: 'importer-scorer',
        source: 'importer',
        target: 'scorer',
        animated: config.enableImporting && config.enableScoring,
        style: {
          stroke: config.enableImporting && config.enableScoring ? undefined : '#6b7280',
          strokeWidth: 2,
        },
      },
      {
        id: 'scorer-generator',
        source: 'scorer',
        target: 'generator',
        animated: config.enableScoring && config.enableAutoTailoring,
        style: {
          stroke: config.enableScoring && config.enableAutoTailoring ? undefined : '#6b7280',
          strokeWidth: 2,
        },
      },
    ]);
  }, [config, setNodes, setEdges, handleToggle]);

  return (
    <div className={cn('h-[600px] rounded-lg border bg-card', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.5}
        maxZoom={1.5}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeClassName={(node) => {
            const data = node.data as PipelineNodeData;
            return data.enabled === false ? 'opacity-30' : '';
          }}
        />
      </ReactFlow>
    </div>
  );
};

// Export hook to get current config
export const usePipelineConfig = (): PipelineEditorConfig => {
  const [config, setConfig] = useState<PipelineEditorConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PIPELINE_CONFIG_KEY);
      if (saved) {
        setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(saved) });
      }
    } catch {
      // Ignore errors
    }

    // Listen for storage changes from other tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === PIPELINE_CONFIG_KEY && e.newValue) {
        try {
          setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(e.newValue) });
        } catch {
          // Ignore errors
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return config;
};
