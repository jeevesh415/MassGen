import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { V2SetupOverlay } from './V2SetupOverlay';
import { useSetupStore } from '../../../stores/setupStore';

// Mock the section components to keep tests focused on overlay behavior
vi.mock('../../setup/ApiKeysSection', () => ({
  ApiKeysSection: () => <div data-testid="api-keys-section">API Keys Content</div>,
}));
vi.mock('../../setup/DockerSection', () => ({
  DockerSection: () => <div data-testid="docker-section">Docker Content</div>,
}));
vi.mock('../../setup/SkillsSection', () => ({
  SkillsSection: () => <div data-testid="skills-section">Skills Content</div>,
}));

describe('V2SetupOverlay', () => {
  beforeEach(() => {
    useSetupStore.setState({
      isOpen: true,
      currentStep: 'apiKeys',
      apiKeyInputs: {},
      savingApiKeys: false,
    });
  });

  it('renders with API Keys step by default', () => {
    render(<V2SetupOverlay />);
    expect(screen.getByText('Setup')).toBeInTheDocument();
    expect(screen.getByTestId('api-keys-section')).toBeInTheDocument();
    expect(screen.getByText('API Keys Content')).toBeInTheDocument();
  });

  it('shows 3 progress dots', () => {
    render(<V2SetupOverlay />);
    const dots = screen.getAllByTestId('progress-dot');
    expect(dots).toHaveLength(3);
  });

  it('navigates forward on Next click', () => {
    render(<V2SetupOverlay />);
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByTestId('docker-section')).toBeInTheDocument();
  });

  it('navigates back on Back click', () => {
    useSetupStore.setState({ currentStep: 'docker' });
    render(<V2SetupOverlay />);
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByTestId('api-keys-section')).toBeInTheDocument();
  });

  it('shows Cancel on first step instead of Back', () => {
    render(<V2SetupOverlay />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.queryByText('Back')).not.toBeInTheDocument();
  });

  it('shows Finish button on last step', () => {
    useSetupStore.setState({ currentStep: 'skills' });
    render(<V2SetupOverlay />);
    expect(screen.getByText('Finish')).toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('calls closeSetup on Finish click', () => {
    useSetupStore.setState({ currentStep: 'skills' });
    render(<V2SetupOverlay />);
    fireEvent.click(screen.getByText('Finish'));
    expect(useSetupStore.getState().isOpen).toBe(false);
  });

  it('calls closeSetup on close (X) button click', () => {
    render(<V2SetupOverlay />);
    fireEvent.click(screen.getByTitle('Close setup'));
    expect(useSetupStore.getState().isOpen).toBe(false);
  });

  it('calls closeSetup on Cancel click (first step)', () => {
    render(<V2SetupOverlay />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(useSetupStore.getState().isOpen).toBe(false);
  });

  it('shows Skills section on last step', () => {
    useSetupStore.setState({ currentStep: 'skills' });
    render(<V2SetupOverlay />);
    expect(screen.getByTestId('skills-section')).toBeInTheDocument();
  });

  it('shows Docker section on middle step', () => {
    useSetupStore.setState({ currentStep: 'docker' });
    render(<V2SetupOverlay />);
    expect(screen.getByTestId('docker-section')).toBeInTheDocument();
  });
});
