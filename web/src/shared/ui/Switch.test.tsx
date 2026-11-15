import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Switch } from './Switch';

function Controlled() {
  const [on, setOn] = useState(false);
  return <Switch label="Allow pointer" description="The viewer can point at your screen." checked={on} onChange={(event) => setOn(event.target.checked)} />;
}

describe('Switch', () => {
  it('is an accessible switch named by its label and described by its description', () => {
    render(<Controlled />);
    const control = screen.getByRole('switch', { name: 'Allow pointer' });
    expect(control).toHaveAccessibleDescription('The viewer can point at your screen.');
    expect(control).not.toBeChecked();
  });

  it('toggles from the control and from its label', () => {
    render(<Controlled />);
    const control = screen.getByRole('switch', { name: 'Allow pointer' });
    fireEvent.click(control);
    expect(control).toBeChecked();
    fireEvent.click(screen.getByText('Allow pointer'));
    expect(control).not.toBeChecked();
  });

  it('respects disabled', () => {
    render(<Switch label="Allow files" disabled defaultChecked={false} />);
    expect(screen.getByRole('switch', { name: 'Allow files' })).toBeDisabled();
  });
});
