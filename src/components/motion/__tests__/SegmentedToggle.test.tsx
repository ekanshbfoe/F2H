import { render, screen, userEvent } from '@testing-library/react-native';

import { SegmentedToggle } from '../SegmentedToggle';

describe('SegmentedToggle', () => {
  it('fires onChange once with the tapped index', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await render(<SegmentedToggle options={['Login', 'Sign up']} value={0} onChange={onChange} />);
    await user.press(screen.getByRole('tab', { name: 'Sign up' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('exposes the selected tab', async () => {
    await render(
      <SegmentedToggle options={['Login', 'Sign up']} value={1} onChange={() => undefined} />,
    );
    expect(screen.getByRole('tab', { name: 'Sign up' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Login' })).not.toBeSelected();
  });
});
