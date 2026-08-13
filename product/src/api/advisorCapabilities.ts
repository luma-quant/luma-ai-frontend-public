import type {
  AdvisorAvailabilityResponse,
  AdvisorOptionDefinition,
} from './backendData';

export function normalizeAdvisorLayerSelection(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    ),
  )];
}

export function filterAvailableAdvisorLayers(
  selectedLayerIds: unknown,
  configuredLayers: AdvisorOptionDefinition[] | null | undefined,
  runtimeLayers: AdvisorAvailabilityResponse['layers'] | null | undefined,
): string[] {
  const configured = new Set(
    (configuredLayers ?? [])
      .filter((layer) => layer.available)
      .map((layer) => layer.id),
  );
  const availableAtRuntime = new Set(
    (runtimeLayers ?? [])
      .filter((layer) => layer.available)
      .map((layer) => layer.layer_id),
  );

  return normalizeAdvisorLayerSelection(selectedLayerIds).filter(
    (layerId) => configured.has(layerId) && availableAtRuntime.has(layerId),
  );
}
