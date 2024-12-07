import Image from 'next/image';
import { Container } from '@/components/container';
import { Box } from '@/components/box';
import { Footer } from '@/components/footer';

export default function Home() {
  return (
    <div className="h-screen bg12 overflow-hidden">
      <Container className="h-full relative">
        <Box className="pt-20">
          <div className=" relative">
            <div className="text-6xl text-white font-medium">Neon Planet</div>
            <div className="mt-6 text-base text-white font-medium">漆黑夜里，风吹熄了星月，你却是我藏在血液里的光</div>

            <div className="absolute right-0 top-0 w-[260px]">
              <Image src="/source/index.png" width={200} height={100} alt="Index" className="w-full h-full" />
            </div>
          </div>
        </Box>
      </Container>

      <Container className="w-full fixed bottom-0 center">
        <Footer />
      </Container>
    </div>
  );
}
