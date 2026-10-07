import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { State, type PanGesture } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { CardDeck } from '../CardDeck';

const cards = [
  { id: 'a', title: 'First' },
  { id: 'b', title: 'Second' },
];

async function swipeRight() {
  fireGestureHandler<PanGesture>(getByGestureTestId('card-deck-pan'), [
    { state: State.BEGAN, translationX: 0, translationY: 0 },
    { state: State.ACTIVE, translationX: 200, translationY: 0 },
    { state: State.END, translationX: 400, translationY: 0, velocityX: 1200 },
  ]);
  // Let the fly off timing animation finish, its completion callback run, and React re-render.
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
}

describe('CardDeck', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the top card and the one beneath', async () => {
    await render(
      <CardDeck cards={cards} keyOf={(c) => c.id} renderCard={(c) => <Text>{c.title}</Text>} />,
    );
    expect(screen.getByText('First')).toBeOnTheScreen();
    expect(screen.getByText('Second')).toBeOnTheScreen();
  });

  it('advances on a swipe past the threshold and reports onEmpty after the last card', async () => {
    const onSwipe = jest.fn();
    const onEmpty = jest.fn();
    await render(
      <CardDeck
        cards={cards}
        keyOf={(c) => c.id}
        renderCard={(c) => <Text>{c.title}</Text>}
        onSwipe={onSwipe}
        onEmpty={onEmpty}
      />,
    );
    await swipeRight();
    expect(onSwipe).toHaveBeenCalledWith(cards[0], 'right');
    expect(screen.queryByText('First')).toBeNull();
    expect(onEmpty).not.toHaveBeenCalled();

    await swipeRight();
    expect(onSwipe).toHaveBeenCalledWith(cards[1], 'right');
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });
});
