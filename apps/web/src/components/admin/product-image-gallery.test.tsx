import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProductImageGallery } from './product-image-gallery';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.scrollIntoView = jest.fn();
  window.matchMedia = jest
    .fn()
    .mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
});

it('keeps replacement and new uploads distinct while selecting gallery images', () => {
  const onUpload = jest.fn();
  const { container } = render(
    <ProductImageGallery
      images={['/one.jpg', '/two.jpg']}
      onUpload={onUpload}
      onRemove={jest.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'View image 2' }));
  expect(screen.getByRole('img', { name: 'Product image 2' })).toHaveAttribute('src', '/two.jpg');
  expect(screen.getByRole('button', { name: 'View image 2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const file = new File(['image'], 'photo.png', { type: 'image/png' });
  const input = container.querySelector('input[type="file"]')!;
  fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
  fireEvent.change(input, { target: { files: [file] } });
  expect(onUpload).toHaveBeenLastCalledWith(file, 1);
  fireEvent.click(screen.getByRole('button', { name: 'Add image' }));
  fireEvent.change(input, { target: { files: [file] } });
  expect(onUpload).toHaveBeenLastCalledWith(file, undefined);
});

it('updates edge fades as a large gallery scrolls and retains its add-image tile', () => {
  render(
    <ProductImageGallery
      images={Array.from({ length: 10 }, (_, i) => `/image-${i}.jpg`)}
      onUpload={jest.fn()}
      onRemove={jest.fn()}
    />,
  );
  const strip = screen.getByRole('region', { name: 'Product images' });
  Object.defineProperties(strip, {
    clientWidth: { value: 430, configurable: true },
    scrollWidth: { value: 1210, configurable: true },
    scrollLeft: { value: 0, writable: true, configurable: true },
  });
  fireEvent.scroll(strip);
  expect(strip.style.maskImage).toContain('to left');
  strip.scrollLeft = 350;
  fireEvent.scroll(strip);
  expect(strip.style.maskImage).toContain('calc(100% - 24px)');
  strip.scrollLeft = 780;
  fireEvent.scroll(strip);
  expect(strip.style.maskImage).toContain('to right');
  expect(strip.style.maskImage).not.toContain('calc(');
  expect(strip).toContainElement(screen.getByRole('button', { name: 'Add image' }));
});

it('prevents additions at the image limit while preserving replacement', () => {
  render(
    <ProductImageGallery
      images={Array.from({ length: 20 }, (_, i) => `/image-${i}.jpg`)}
      onUpload={jest.fn()}
      onRemove={jest.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Add image' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Browse' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Replace' })).toBeEnabled();
});
